import type { Repository } from 'typeorm';
import { SIM, type UserInfo } from '../database/entities/user-info.entity.js';
import type { User } from '../database/entities/user.entity.js';

/** Texto que parece CPF digitado (só dígitos, pontos, traço e espaços). */
const PARECE_CPF = /^[\d.\-\s]+$/;

export type LoginLookup =
  | { tipo: 'encontrado'; user: User & { info: UserInfo } }
  | { tipo: 'nenhum' }
  /** O mesmo e-mail está em mais de uma conta ativa (acontece nos dados do APAC Onco). */
  | { tipo: 'ambiguo' };

/**
 * Acha a conta pelo que a pessoa digitou no campo de login:
 *  - com "@": e-mail, sem diferenciar maiúsculas;
 *  - senão: `no_login`, sem diferenciar maiúsculas; e, se parecer CPF,
 *    também comparando só os dígitos (quem tem login "123.949.490-40" entra
 *    digitando "12394949040" e vice-versa).
 * Contas excluídas (dt_exclusao) ficam de fora. Nada é alterado no banco.
 */
export async function findUserByLogin(repo: Repository<User>, login: string): Promise<LoginLookup> {
  const valor = login.trim();
  if (!valor) return { tipo: 'nenhum' };

  const qb = repo
    .createQueryBuilder('user')
    .innerJoinAndSelect('user.info', 'info')
    .where('info.dt_exclusao IS NULL');

  if (valor.includes('@')) {
    qb.andWhere('lower(user.email) = lower(:valor)', { valor });
  } else {
    const digitos = PARECE_CPF.test(valor) ? valor.replace(/\D/g, '') : '';
    qb.andWhere(
      digitos.length >= 11
        ? `(lower(info.no_login) = lower(:valor) OR (info.no_login ~ '^[0-9.\\-\\s]+$' AND regexp_replace(info.no_login, '\\D', '', 'g') = :digitos))`
        : 'lower(info.no_login) = lower(:valor)',
      { valor, digitos },
    );
  }

  const encontrados = (await qb.take(5).getMany()) as Array<User & { info: UserInfo }>;
  if (encontrados.length === 0) return { tipo: 'nenhum' };
  if (encontrados.length === 1) return { tipo: 'encontrado', user: encontrados[0] };

  // Mais de uma conta: se só uma estiver ativa e com senha, é ela; senão não dá para saber quem é.
  const utilizaveis = encontrados.filter((u) => podeEntrar(u));
  return utilizaveis.length === 1 ? { tipo: 'encontrado', user: utilizaveis[0] } : { tipo: 'ambiguo' };
}

/** Situação da conta (só a tb_usuario + users_info, sem olhar perfil). */
export function contaAtiva(info: UserInfo | null | undefined): boolean {
  return !!info && info.stRegistroAtivo === SIM && !info.dtExclusao;
}

/** Tem senha e a conta está ativa. */
export function podeEntrar(user: User): boolean {
  return !!user.senha && contaAtiva(user.info);
}
