import * as bcrypt from 'bcryptjs';
import { createInterface, type Interface } from 'node:readline';
import { findUserByLogin } from '../../auth/login-lookup.js';
import { latestPermission } from '../../auth/permissions.js';
import { isNationalProfile, PROFILE_SCOPE_LEVEL, SCOPE_LEVELS, type ScopeLevel, UserProfile } from '../../auth/profiles.js';
import { applyScope, describeScope, EMPTY_SCOPE, type UserScope } from '../../auth/scope.js';
import { encryptCpf } from '../../common/crypto/cpf-cipher.js';
import { isValidCpf } from '../../users/cpf.js';
import { AppDataSource } from '../data-source.js';
import { UserAudit, UserAuditAction } from '../entities/user-audit.entity.js';
import { UserInfo } from '../entities/user-info.entity.js';
import { UserPermission } from '../entities/user-permission.entity.js';
import { User } from '../entities/user.entity.js';

/**
 * Registra uma conta no OncoDash pelo terminal (pode rodar quantas vezes
 * precisar — não existe "a" conta de administrador):
 *
 *   npm run conta:registrar
 *
 * Pergunta o CPF primeiro:
 *  - CPF que ainda não existe → cria a conta (nome, e-mail, cargo, senha,
 *    perfil, recorte e permissões);
 *  - CPF que já existe (ex.: importado da tb_usuario) → só define o perfil,
 *    o recorte e as permissões no OncoDash. Nome, e-mail e senha não mudam;
 *    se a conta não tiver senha, oferece criar uma.
 *
 * Fica registrado na auditoria de usuários (sem autor, origem "terminal").
 */
const PASSWORD_SALT_ROUNDS = 10;
const PROFILES = Object.values(UserProfile);

const LEVEL_PROMPT: Record<ScopeLevel, { label: string; formato?: RegExp; dica: string }> = {
  uf: { label: 'UF', formato: /^[A-Z]{2}$/, dica: 'sigla, ex.: PE' },
  macrorregiao: { label: 'Macrorregião de saúde', dica: 'código' },
  regiaoSaude: { label: 'Região de saúde', dica: 'código' },
  municipio: { label: 'Município', formato: /^\d{6,7}$/, dica: 'código IBGE' },
  cnes: { label: 'Unidade (CNES)', formato: /^\d{7}$/, dica: '7 dígitos' },
};

class Terminal {
  private readonly rl: Interface;
  private readonly linhas: AsyncIterator<string>;
  private mudo = false;
  private promptAtual = '';

  constructor() {
    this.rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    // Enquanto `mudo`, o que a pessoa digita aparece como * (senha).
    const rl = this.rl as unknown as { _writeToOutput: (s: string) => void };
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s: string) => {
      if (!this.mudo || s === '\r\n' || s === '\n') original(s);
      // Ao apagar, o readline redesenha "prompt + texto": mantém o prompt e esconde o texto.
      else if (s.startsWith(this.promptAtual)) original(this.promptAtual + '*'.repeat(s.length - this.promptAtual.length));
      else original('*'.repeat(s.length));
    };
    // Lê linha a linha numa fila: funciona digitando e também com entrada redirecionada.
    this.linhas = this.rl[Symbol.asyncIterator]();
  }

  private async ler(texto: string, mudo: boolean): Promise<string> {
    this.promptAtual = texto;
    this.rl.setPrompt(texto);
    this.rl.prompt();
    this.mudo = mudo;
    try {
      const r = await this.linhas.next();
      if (r.done) throw new Error('Entrada encerrada antes do fim.');
      return r.value;
    } finally {
      this.mudo = false;
    }
  }

  async pergunta(texto: string): Promise<string> {
    return (await this.ler(texto, false)).trim();
  }

  senha(texto: string): Promise<string> {
    return this.ler(texto, true);
  }

  async obrigatoria(texto: string, valida?: (v: string) => string | null): Promise<string> {
    for (;;) {
      const v = await this.pergunta(texto);
      const erro = !v ? 'Obrigatório.' : (valida?.(v) ?? null);
      if (!erro) return v;
      console.log(`  ${erro}`);
    }
  }

  async simNao(texto: string, padrao: boolean): Promise<boolean> {
    const r = (await this.pergunta(`${texto} ${padrao ? '[S/n]' : '[s/N]'} `)).toLowerCase();
    return r ? r.startsWith('s') : padrao;
  }

  fechar() {
    this.rl.close();
  }
}

async function escolherPerfil(t: Terminal): Promise<UserProfile> {
  console.log('\nPerfil de acesso:');
  PROFILES.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  const n = await t.obrigatoria('Número do perfil: ', (v) =>
    /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= PROFILES.length ? null : `Escolha de 1 a ${PROFILES.length}.`,
  );
  return PROFILES[Number(n) - 1];
}

/** Pergunta os níveis do recorte até o nível do perfil; o do próprio perfil é obrigatório. */
async function escolherRecorte(t: Terminal, perfil: UserProfile, cnesSugerido: string | null): Promise<UserScope> {
  const nivel = PROFILE_SCOPE_LEVEL[perfil];
  if (nivel === null) return { ...EMPTY_SCOPE };

  console.log(`\nRecorte nas abas restritas (${perfil}):`);
  const scope: UserScope = { ...EMPTY_SCOPE };
  for (const level of SCOPE_LEVELS.slice(0, SCOPE_LEVELS.indexOf(nivel) + 1)) {
    const { label, formato, dica } = LEVEL_PROMPT[level];
    const obrigatorio = level === nivel;
    const sugestao = level === 'cnes' && cnesSugerido ? ` [${cnesSugerido}]` : '';
    for (;;) {
      let codigo = (await t.pergunta(`  ${label} (${dica}${obrigatorio ? '' : ', opcional'})${sugestao}: `)).toUpperCase();
      if (!codigo && sugestao) codigo = cnesSugerido!;
      if (!codigo && !obrigatorio) break;
      if (!codigo) {
        console.log('    Obrigatório para este perfil.');
        continue;
      }
      if (formato && !formato.test(codigo)) {
        console.log(`    Formato inválido (${dica}).`);
        continue;
      }
      const nome = await t.pergunta(`  Nome de ${label} (opcional): `);
      scope[level] = { codigo, nome: nome || null };
      break;
    }
  }
  return scope;
}

async function pedirSenha(t: Terminal): Promise<string> {
  for (;;) {
    const s1 = await t.senha('Senha (mín. 8 caracteres): ');
    if (s1.length < 8 || s1.length > 72) {
      console.log('  A senha precisa ter de 8 a 72 caracteres.');
      continue;
    }
    const s2 = await t.senha('Repita a senha: ');
    if (s1 === s2) return s1;
    console.log('  As senhas não coincidem.');
  }
}

async function main() {
  const t = new Terminal();
  await AppDataSource.initialize();
  try {
    const users = AppDataSource.getRepository(User);
    const permissions = AppDataSource.getRepository(UserPermission);

    console.log('Registrar conta no OncoDash\n');
    const cpf = (
      await t.obrigatoria('CPF: ', (v) => (isValidCpf(v.replace(/\D/g, '')) ? null : 'CPF inválido.'))
    ).replace(/\D/g, '');

    const found = await findUserByLogin(users, cpf);
    if (found.tipo === 'ambiguo') {
      console.log('Este CPF aparece em mais de uma conta ativa. Resolva no banco antes de continuar.');
      process.exitCode = 1;
      return;
    }

    // ── Conta que já existe: só perfil, recorte e permissões ──────────────
    if (found.tipo === 'encontrado') {
      const user = found.user;
      const atual = await latestPermission(permissions, user.id);
      console.log(`\nJá existe uma conta com este CPF:`);
      console.log(`  ${user.nome} · ${user.email ?? 'sem e-mail'} · login ${user.info.noLogin}`);
      console.log(`  Perfil no OncoDash: ${atual ? atual.profile : 'nenhum'} · ${user.senha ? 'tem senha' : 'SEM senha'}`);
      if (!(await t.simNao('Definir o perfil desta conta?', true))) return;

      const perfil = await escolherPerfil(t);
      const scope = await escolherRecorte(t, perfil, user.info.coCnes);
      const nacional = isNationalProfile(perfil);
      const canAdd = await t.simNao('Pode convidar usuários?', nacional);
      const canEdit = await t.simNao('Pode editar dados?', nacional);
      let novaSenha: string | null = null;
      if (!user.senha && (await t.simNao('A conta não tem senha. Criar uma agora?', false))) {
        novaSenha = await pedirSenha(t);
      }

      console.log(`\n${user.nome} → ${perfil}${describeScope(scope) ? ` · ${describeScope(scope)}` : ''}`);
      if (!(await t.simNao('Confirmar?', true))) return;

      await AppDataSource.transaction(async (em) => {
        const info = user.info;
        applyScope(info, scope);
        info.dtAtualizacao = new Date();
        if (novaSenha) {
          await em.update(User, { id: user.id }, { senha: await bcrypt.hash(novaSenha, PASSWORD_SALT_ROUNDS) });
          info.senhaAlteradaEm = info.dtAtualizacao;
        }
        await em.save(info);
        await em.save(em.create(UserPermission, { idUsers: user.id, profile: perfil, canAdd, canEdit }));
        await em.save(
          em.create(UserAudit, {
            idUsersActor: null,
            idUsersTarget: user.id,
            acao: UserAuditAction.PERMISSAO_ALTERADA,
            antes: atual ? { profile: atual.profile, canAdd: atual.canAdd, canEdit: atual.canEdit } : null,
            depois: { profile: perfil, canAdd, canEdit, escopo: describeScope(scope), origem: 'terminal', senhaCriada: !!novaSenha },
          }),
        );
      });
      console.log(`Pronto. ${user.senha || novaSenha ? `Entre com o CPF ${cpf}.` : 'A conta ainda precisa de senha (convite pelo painel).'}`);
      return;
    }

    // ── Conta nova ────────────────────────────────────────────────────────
    const nome = await t.obrigatoria('Nome completo: ', (v) => (v.length <= 255 ? null : 'Máximo 255 caracteres.'));
    const emailRaw = await t.pergunta('E-mail (opcional, usado para recuperar a senha): ');
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log('E-mail inválido.');
      process.exitCode = 1;
      return;
    }
    const cargo = (await t.pergunta('Cargo (opcional): ')) || null;
    const telefone = (await t.pergunta('Telefone (opcional): ')) || null;
    const senha = await pedirSenha(t);
    const perfil = await escolherPerfil(t);
    const scope = await escolherRecorte(t, perfil, null);
    const nacional = isNationalProfile(perfil);
    const canAdd = await t.simNao('Pode convidar usuários?', nacional);
    const canEdit = await t.simNao('Pode editar dados?', nacional);

    console.log(`\n${nome} · CPF ${cpf} · ${email ?? 'sem e-mail'} · ${perfil}${describeScope(scope) ? ` · ${describeScope(scope)}` : ''}`);
    if (!(await t.simNao('Confirmar?', true))) return;

    const id = await AppDataSource.transaction(async (em) => {
      const now = new Date();
      const user = await em.save(em.create(User, { nome, email, senha: await bcrypt.hash(senha, PASSWORD_SALT_ROUNDS) }));
      const info = em.create(UserInfo, {
        idUsers: user.id,
        noLogin: cpf,
        cpf: encryptCpf(cpf),
        cargo,
        telefone,
        dtCriacao: now,
        senhaAlteradaEm: now,
      });
      applyScope(info, scope);
      await em.save(info);
      await em.save(em.create(UserPermission, { idUsers: user.id, profile: perfil, canAdd, canEdit }));
      await em.save(
        em.create(UserAudit, {
          idUsersActor: null,
          idUsersTarget: user.id,
          acao: UserAuditAction.USUARIO_CRIADO,
          depois: { email, profile: perfil, canAdd, canEdit, escopo: describeScope(scope), origem: 'terminal' },
        }),
      );
      return user.id;
    });
    console.log(`Conta criada (id ${id}). Entre com o CPF ${cpf}.`);
  } finally {
    t.fechar();
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
