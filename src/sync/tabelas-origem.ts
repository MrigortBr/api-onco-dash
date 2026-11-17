import { pacienteHash } from './paciente-hash.js';

/** Schema do clone no banco do OncoDash (ver migration CreateApacClone). */
export const SCHEMA_CLONE = 'apac';

export interface TabelaOrigem {
  /** Mesmo nome na origem (dbapaconco) e no clone (apac). */
  name: string;
  pk: string;
  /** CPFs em texto puro na origem, gravados cifrados (AES-256-GCM) no clone. */
  cpfColumns?: string[];
  /**
   * Colunas da origem que o clone não guarda de propósito (dados pessoais
   * que o painel não usa). Ficam fora sem aviso no log; qualquer OUTRA
   * coluna nova da origem que o clone não conheça gera aviso.
   */
  omitir?: string[];
  /** Ajuste da linha antes de gravar (roda antes de cifrar CPF e de omitir colunas). */
  derivar?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Tabelas clonadas, na ordem da cópia (domínios antes das solicitações,
 * solicitação antes dos filhos — sem FK no clone, a ordem só deixa o log
 * mais fácil de ler). Todas são lidas inteiras a cada execução: o volume é
 * pequeno e assim exclusões físicas na origem também chegam aqui.
 */
export const TABELAS_ORIGEM: TabelaOrigem[] = [
  // Domínios
  { name: 'tb_cid', pk: 'co_seq_cid' },
  { name: 'tb_morfologia_tumoral', pk: 'co_seq_morfologia_tumoral' },
  { name: 'tb_tipo_estadiamento', pk: 'co_seq_tipo_estadiamento' },
  { name: 'tb_estadio_calculado', pk: 'co_seq_estadio_calculado' },
  { name: 'tb_resultado_her2', pk: 'co_seq_resultado_her2' },
  { name: 'tb_tipo_biomarcador', pk: 'co_seq_tipo_biomarcador' },
  { name: 'tb_resultado_biomarcador', pk: 'co_seq_resultado_biomarcador' },
  { name: 'tb_pcdt', pk: 'co_seq_pcdt' },
  { name: 'tb_medicamento', pk: 'co_seq_medicamento' },
  { name: 'tb_param_referencia_dominio', pk: 'co_seq_param_ref_dominio' },
  { name: 'tb_dominio_terapia', pk: 'co_seq_dominio_terapia' },
  // Perfis do APAC Onco (para sugerir o perfil no OncoDash dos usuários importados)
  { name: 'tb_perfil', pk: 'co_seq_perfil' },
  { name: 'rl_usuario_perfil', pk: 'co_seq_usuario_perfil' },
  // Solicitações
  {
    name: 'tb_solicitacao_apac',
    pk: 'co_seq_solicitacao_apac',
    cpfColumns: ['nu_cpf_paciente', 'nu_cpf_prof_solicitante', 'nu_cpf_medico_responsavel', 'nu_cpf_avaliador'],
    omitir: [
      'nu_cns_paciente',
      'no_paciente',
      'dt_nascimento',
      'no_mae',
      'no_nome_social',
      'nu_cep',
      'tp_logradouro',
      'no_logradouro',
      'nu_endereco',
      'no_bairro',
      'no_municipio_nascimento',
    ],
    derivar: (row) => ({ ...row, co_paciente_hash: pacienteHash(row.nu_cpf_paciente, row.nu_cns_paciente) }),
  },
  { name: 'tb_solicitacao_apac_parecer', pk: 'co_seq_solic_apac_parecer', cpfColumns: ['nu_cpf_avaliador'] },
  { name: 'rl_solic_apac_parecer_motivo', pk: 'co_seq_solic_apac_parec_motivo' },
  { name: 'tb_solicitacao_apac_devolucao', pk: 'co_seq_solic_apac_devolucao', cpfColumns: ['nu_cpf_avaliador'] },
  { name: 'rl_solic_apac_devol_motivo', pk: 'co_seq_solic_apac_devol_motivo' },
  { name: 'tb_solic_apac_medicamento', pk: 'co_seq_solic_apac_medicamento' },
  { name: 'tb_solic_apac_cancelamento', pk: 'co_seq_solic_apac_cancelamento', cpfColumns: ['nu_cpf_usuario_cancelamento'] },
  { name: 'tb_solicitacao_apac_numero', pk: 'co_seq_solicitacao_apac_numero' },
  { name: 'rl_solic_apac_biomarcador', pk: 'co_seq_solic_apac_biomarcador' },
  { name: 'rl_solic_apac_estad_compl', pk: 'co_seq_solic_apac_estad_compl' },
  { name: 'rl_solic_apac_cid_secundario', pk: 'co_seq_solic_apac_cid_secund' },
];
