# api-onco-dash

API do OncoDash (NestJS 12 + TypeORM + PostgreSQL). Nesta etapa: login, cadastro por convite, recuperação de senha, perfis com recorte territorial e auditoria. A lógica segue o documento "OncoDash · Lógica de login e registro" e o login do SIMDASH.

## Rodar localmente

```bash
cp .env.example .env        # preencha DB_*, JWT_SECRET e CPF_ENCRYPTION_KEY
npm install
npm run migration:run       # cria/atualiza as tabelas
npm run seed:usuarios       # importa a tb_usuario do APAC Onco (dados/tb_usuario.csv)
npm run conta:registrar     # registra uma conta (rode uma vez para cada pessoa que precisar)
npm run start:dev           # http://localhost:3001
```

## Registrar uma conta (`conta:registrar`)

Script interativo no terminal — não existe uma conta de administrador fixa; rode quantas vezes precisar.
Pergunta o CPF primeiro:

- **CPF novo** → cria a conta: nome, e-mail (opcional), cargo, telefone, senha, perfil, recorte e permissões.
- **CPF que já existe** (ex.: importado da tb_usuario) → só define perfil, recorte e permissões no OncoDash;
  nome, e-mail e senha não mudam. Se a conta não tiver senha, oferece criar uma.

Tudo fica na auditoria de usuários (origem "terminal"). Depois disso, quem tem perfil que convida faz o resto pelo painel.

## Dados do APAC Onco (atualização diária)

Igual ao SIMDASH: a API lê o banco do APAC Onco (somente leitura, `SOURCE_DB_*` no `.env`) e copia para o
schema `apac` deste banco — **todo dia às 9h, 13h e 17h (Brasília)**, mais um horário opcional em
`SYNC_EXTRA_HOUR`, ou na hora pela tela **Atualização** (Desenvolvedor e Gestor federal), que mostra o andamento
ao vivo e o histórico de execuções. O rodapé mostra a data da última atualização.

- Leitura da origem num snapshot (todas as tabelas no mesmo instante), sem travar quem usa o APAC Onco.
- Valores copiados sem alteração (datas com microssegundos e fuso); só grava o que mudou; o que foi apagado
  na origem é apagado aqui; a gravação inteira é uma transação — falhou, nada muda.
- Tabelas: solicitações (`tb_solicitacao_apac`, parecer, devoluções, motivos, medicamentos, cancelamento,
  números de APAC, biomarcadores, estadiamentos complementares, CIDs secundários), domínios (CID, morfologia,
  estadiamento, HER2, biomarcadores, medicamentos, PCDT, parâmetros) e perfis do APAC Onco.
- LGPD: CPFs gravados cifrados; nome, nome social, nome da mãe, nascimento, CNS e endereço do paciente **não**
  são copiados; `co_paciente_hash` identifica o paciente sem dizer quem é.
- `tb_usuario` também é sincronizada: contas novas entram, desativações e exclusões valem na hora; a senha
  trocada no OncoDash e o e-mail informado aqui (quando o APAC Onco não tem) são preservados.

Rotas: `GET /sync/last-update` (logado), `GET /sync/status`, `GET /sync/history`, `POST /sync/run`,
`GET /sync/stream` (Desenvolvedor, Gestor federal).

## Usuários do APAC Onco (`seed:usuarios`)

Para a primeira carga sem acesso ao banco (depois a atualização diária mantém em dia): exporte a `dbapaconco.tb_usuario` em CSV (com cabeçalho, separador vírgula, NULL como vazio) e salve em
`dados/tb_usuario.csv` — ou passe o caminho: `npm run seed:usuarios -- C:\caminho\tb_usuario.csv`.
A pasta `dados/` e arquivos `.csv` estão no `.gitignore`: o arquivo tem CPF e hash de senha.

O seed grava os valores **sem alteração**, em duas tabelas ligadas pelo mesmo id (`co_seq_usuario`):

| Tabela | Colunas |
|---|---|
| `users` | `id` ← co_seq_usuario, `nome` ← no_usuario, `email` ← ds_email, `senha` ← ds_senha_hash |
| `users_info` | as demais colunas da tb_usuario, com os mesmos nomes, + dados do OncoDash (cargo, telefone, CPF criptografado, escopo) e `importado_em` |

No fim ele compara cada linha do arquivo, coluna a coluna, com o banco; qualquer diferença desfaz a importação.
Pode rodar de novo: quem já foi importado fica como está (`--atualizar` sobrescreve os campos da tb_usuario com os do arquivo).
Se uma conta criada no OncoDash estiver num id da tb_usuario, ela ganha um id novo (as tabelas ligadas acompanham).

Login: **CPF/login ou e-mail** + a mesma senha do APAC Onco (bcrypt `$2a$`). O e-mail só funciona se não estiver
repetido em outra conta. Para entrar, a conta precisa estar ativa (`st_registro_ativo = 'S'`, sem `dt_exclusao`), ter
senha e ter um perfil no OncoDash — os importados chegam sem perfil; o Desenvolvedor atribui em **Usuários → Editar**.
Quem não tem senha recebe um convite (precisa de e-mail cadastrado) e, ao aceitar, informa o CPF, que tem de bater com o login.

Gerar as chaves:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CPF_ENCRYPTION_KEY
```

## Produção (Railway)

```bash
npm run build
npm run migration:run:prod
npm run seed:usuarios:prod -- dados/tb_usuario.csv   # só na primeira vez
npm run conta:registrar:prod                         # quando precisar registrar uma conta
npm run start:prod
```

Variáveis obrigatórias em produção: `JWT_SECRET`, `CPF_ENCRYPTION_KEY`, `CORS_ORIGIN`, `FRONTEND_URL`, `DATABASE_URL` (ou `DB_*`), `COOKIE_SECURE=true`. O front deve chamar a API pela rede privada do Railway (`API_URL` do front) e `TRUST_PROXY` deve refletir quantos proxies há na frente da API, para o IP da auditoria sair certo.

## Rotas

| Rota | Acesso | O que faz |
| --- | --- | --- |
| `POST /auth/login` | pública (5/min por IP + e-mail) | `{ email, senha, fingerprint, latitude, longitude }` → grava o cookie `oncodash_session` e devolve `{ user }` |
| `GET /auth/me` | logado | Usuário, perfil e escopo atuais |
| `POST /auth/logout` | logado | Encerra a sessão no banco e apaga o cookie |
| `POST /auth/forgot-password` | pública | Envia link de 1 hora (resposta sempre igual) |
| `POST /auth/reset-password` | pública | `{ token, senha }` → troca a senha e encerra todas as sessões |
| `GET /invites/:token` | pública | Dados do convite |
| `POST /invites/:token/accept` | pública | `{ senha, cpf, telefone }` → ativa a conta |
| `GET /users`, `GET /users/invite-options`, `POST /users/invites`, `POST /users/:id/resend-invite` | perfis que convidam | Lista (dentro do próprio escopo) e convites |
| `GET /users/:id`, `PATCH /users/:id` | Desenvolvedor, Gestor federal | Edição de dados, perfil, escopo e permissões |
| `GET /audit/logins`, `GET /audit/users`, `GET /audit/exports` | Desenvolvedor, Gestor federal | Auditoria |
| `POST /audit/exports` | logado | Registra uma exportação feita no painel |
| `GET /painel/escopo` | logado (`@Restrita`) | Recorte aplicado ao usuário nas abas restritas |
| `GET /health` | pública | Verificação de saúde |

Toda rota logada exige o cookie **e** o header `X-Device-Fingerprint` igual ao do login.

## Abas restritas

Para restringir a rota de uma aba ao escopo do usuário:

```ts
@Restrita()
@Get('pacientes')
listar(@Escopo() escopo: DataScope) {
  const qb = this.repo.createQueryBuilder('sol');
  const where = scopeWhere(escopo, { uf: 'sol.uf_servico', municipio: 'sol.cod_mun_servico', cnes: 'sol.cnes' /* ... */ });
  if (where) qb.andWhere(where.sql, where.params);
  return qb.getMany();
}
```

Se a aba não informar a coluna do nível do usuário, o resultado é vazio (falha fechada). O código do paciente só pode aparecer quando `canSeePatientCode(user, true)` (perfil Unidade).

## Testes

```bash
npm test          # regras: hierarquia, risco do login, escopo, CPF
npm run test:e2e  # sobe o app sem banco e testa /health
```

O fluxo completo (login, sessão presa ao dispositivo, convite, ativação, permissões, escopo, recuperação de senha, logout, limite de tentativas e auditoria) foi validado contra PostgreSQL 16 em 13/11/2026.
