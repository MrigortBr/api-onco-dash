/**
 * Uma linha por solicitação, no formato do protótipo (as 41 colunas que as
 * abas do painel usam), montada a partir do clone `apac`.
 *
 * O que ainda não existe no banco do APAC Onco fica NULL e aparece como
 * "Não informado" no painel: macrorregião, região de saúde e município do
 * serviço, tipo do serviço (CACON/UNACON), região de saúde de residência,
 * coordenadas e distância. Chegam quando as tabelas de território/CNES forem
 * incorporadas.
 */
export const COLUNAS_PAINEL = [
  'id', 'paciente', 'data_diagnostico', 'data_solicitacao', 'data_envio', 'data_decisao', 'situacao',
  'dias_ate_parecer', 'dias_aguardando', 'n_devolucoes', 'motivo_devolucao', 'motivo_indeferimento',
  'medicamento', 'cid', 'cid_nome', 'morfologia', 'sistema_estadiamento', 'estadio_clinico', 'her2', 'recidiva',
  'linha_tratamento', 'finalidade', 'codigo_apac', 'cbo_prescritor', 'regiao', 'uf', 'macro_saude', 'regiao_saude',
  'mun_servico', 'cnes', 'no_estabelecimento', 'tipo_servico', 'mun_residencia', 'uf_residencia',
  'regiao_saude_residencia', 'lat_res', 'lon_res', 'lat_srv', 'lon_srv', 'distancia_km', 'sexo', 'idade', 'faixa_etaria',
] as const;

/** Rótulos dos motivos (enums do APAC Onco). */
const MOTIVO = `CASE m.tp_motivo
  WHEN 'DocumentoNaoCorrespondeExame' THEN 'Documento não corresponde ao exame'
  WHEN 'DocumentoNaoCorrespondePaciente' THEN 'Documento não corresponde ao paciente'
  WHEN 'DocumentoNaoCorrespondePrescricao' THEN 'Documento não corresponde à prescrição'
  WHEN 'InconformidadeResultadosExames' THEN 'Inconformidade nos resultados de exames'
  WHEN 'InconformidadePrescricao' THEN 'Inconformidade na prescrição'
  WHEN 'PendenciasNaoRespondidas' THEN 'Pendências não respondidas no prazo'
  WHEN 'Outros' THEN 'Outros'
  ELSE m.tp_motivo END`;

const DIA = (col: string) => `to_char((${col} AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`;

const REGIAO_POR_UF = `CASE
  WHEN s.sg_uf_estabelecimento IN ('AC','AM','AP','PA','RO','RR','TO') THEN 'Norte'
  WHEN s.sg_uf_estabelecimento IN ('AL','BA','CE','MA','PB','PE','PI','RN','SE') THEN 'Nordeste'
  WHEN s.sg_uf_estabelecimento IN ('DF','GO','MS','MT') THEN 'Centro-Oeste'
  WHEN s.sg_uf_estabelecimento IN ('ES','MG','RJ','SP') THEN 'Sudeste'
  WHEN s.sg_uf_estabelecimento IN ('PR','RS','SC') THEN 'Sul' END`;

/** `:escopo` é trocado pela condição do recorte (ou TRUE). */
export const SQL_PAINEL = `
WITH parecer AS (
  SELECT p.co_solicitacao_apac, p.tp_resultado, p.dt_emissao,
    (SELECT ${MOTIVO} FROM apac.rl_solic_apac_parecer_motivo m
      WHERE m.co_solicitacao_apac = p.co_solicitacao_apac ORDER BY m.co_seq_solic_apac_parec_motivo LIMIT 1) AS motivo,
    EXISTS (SELECT 1 FROM apac.rl_solic_apac_parecer_motivo m
      WHERE m.co_solicitacao_apac = p.co_solicitacao_apac AND m.tp_motivo = 'PendenciasNaoRespondidas') AS por_prazo
  FROM apac.tb_solicitacao_apac_parecer p
),
devolucao AS (
  SELECT d.co_solicitacao_apac, COUNT(*)::int AS n,
    (SELECT ${MOTIVO} FROM apac.tb_solicitacao_apac_devolucao d2
       JOIN apac.rl_solic_apac_devol_motivo m ON m.co_solicitacao_apac_devolucao = d2.co_seq_solic_apac_devolucao
      WHERE d2.co_solicitacao_apac = d.co_solicitacao_apac
      ORDER BY d2.dt_devolucao DESC, m.co_seq_solic_apac_devol_motivo LIMIT 1) AS motivo
  FROM apac.tb_solicitacao_apac_devolucao d
  GROUP BY d.co_solicitacao_apac
),
medicamento AS (
  SELECT DISTINCT ON (sm.co_solicitacao_apac) sm.co_solicitacao_apac, COALESCE(md.ds_medicamento, sm.ds_medicamento) AS nome
  FROM apac.tb_solic_apac_medicamento sm
  LEFT JOIN apac.tb_medicamento md ON md.co_seq_medicamento = sm.co_medicamento
  ORDER BY sm.co_solicitacao_apac, sm.nu_ordem, sm.co_seq_solic_apac_medicamento
)
SELECT
  'SOL-' || s.nu_ano_solicitacao || '-' || lpad(s.nu_sequencial_solicitacao::text, 7, '0') AS id,
  CASE WHEN s.co_paciente_hash IS NOT NULL THEN 'PAC-' || upper(left(s.co_paciente_hash, 8)) END AS paciente,
  to_char(s.dt_diagnostico_oncologico, 'YYYY-MM-DD') AS data_diagnostico,
  ${DIA('COALESCE(s.dt_solicitacao, s.dt_criacao)')} AS data_solicitacao,
  ${DIA('s.dt_envio')} AS data_envio,
  ${DIA('COALESCE(pa.dt_emissao, s.dt_autorizacao)')} AS data_decisao,
  CASE s.tp_status
    WHEN 'Indeferida' THEN CASE WHEN pa.por_prazo THEN 'Indeferida (prazo)' ELSE 'Indeferida' END
    WHEN 'EmAnalise' THEN 'Em análise'
    WHEN 'Corrigida' THEN 'Enviada'
    ELSE s.tp_status END AS situacao,
  round((extract(epoch FROM (pa.dt_emissao - COALESCE(s.dt_envio, s.dt_solicitacao))) / 86400)::numeric, 1) AS dias_ate_parecer,
  CASE WHEN s.tp_status IN ('Enviada', 'EmAnalise', 'Corrigida')
    THEN round((extract(epoch FROM (now() - COALESCE(s.dt_correcao, s.dt_envio, s.dt_solicitacao))) / 86400)::numeric, 1) END AS dias_aguardando,
  COALESCE(dv.n, 0) AS n_devolucoes,
  dv.motivo AS motivo_devolucao,
  CASE WHEN s.tp_status = 'Indeferida' THEN pa.motivo END AS motivo_indeferimento,
  COALESCE(me.nome, s.ds_medicamento_resumo) AS medicamento,
  c.sg_codigo AS cid,
  c.ds_cid AS cid_nome,
  NULLIF(trim(COALESCE(mo.sg_codigo, '') || ' ' || COALESCE(mo.ds_morfologia_tumoral, '')), '') AS morfologia,
  te.ds_tipo_estadiamento AS sistema_estadiamento,
  COALESCE(ec.ds_estadio_calculado, s.ds_estadio_clinico) AS estadio_clinico,
  CASE
    WHEN h.sg_codigo IS NULL THEN 'Não se aplica'
    WHEN h.sg_codigo = '2+' AND s.ds_fish_resultado ILIKE 'pos%' THEN '2+ (FISH positivo)'
    WHEN h.sg_codigo = '2+' AND s.ds_fish_resultado ILIKE 'neg%' THEN '2+ (FISH negativo)'
    WHEN h.sg_codigo = '2+' THEN '2+ (sem FISH)'
    ELSE h.sg_codigo END AS her2,
  CASE s.st_recidiva WHEN 'S' THEN 'Sim' WHEN 'N' THEN 'Não' END AS recidiva,
  s.ds_linha_tratamento AS linha_tratamento,
  s.ds_finalidade_tratamento AS finalidade,
  CASE
    WHEN pc.ds_sigtap ~ '^[0-9]{10}$'
      THEN substr(pc.ds_sigtap,1,2)||'.'||substr(pc.ds_sigtap,3,2)||'.'||substr(pc.ds_sigtap,5,2)||'.'||substr(pc.ds_sigtap,7,3)||'-'||substr(pc.ds_sigtap,10,1)
    ELSE COALESCE(pc.ds_sigtap, 'A definir') END AS codigo_apac,
  NULLIF(trim(COALESCE(s.co_cbo, '') || ' ' || COALESCE(s.ds_cbo, '')), '') AS cbo_prescritor,
  ${REGIAO_POR_UF} AS regiao,
  s.sg_uf_estabelecimento AS uf,
  NULL::text AS macro_saude,
  NULL::text AS regiao_saude,
  NULL::text AS mun_servico,
  s.co_cnes AS cnes,
  s.no_estabelecimento,
  NULL::text AS tipo_servico,
  s.no_municipio AS mun_residencia,
  s.sg_uf AS uf_residencia,
  NULL::text AS regiao_saude_residencia,
  NULL::numeric AS lat_res, NULL::numeric AS lon_res, NULL::numeric AS lat_srv, NULL::numeric AS lon_srv,
  NULL::numeric AS distancia_km,
  s.tp_sexo AS sexo,
  s.nu_idade AS idade,
  CASE WHEN s.nu_idade IS NULL THEN NULL WHEN s.nu_idade < 30 THEN 'até 29' WHEN s.nu_idade < 40 THEN '30–39'
    WHEN s.nu_idade < 50 THEN '40–49' WHEN s.nu_idade < 60 THEN '50–59' WHEN s.nu_idade < 70 THEN '60–69' ELSE '70+' END AS faixa_etaria
FROM apac.tb_solicitacao_apac s
LEFT JOIN parecer pa ON pa.co_solicitacao_apac = s.co_seq_solicitacao_apac
LEFT JOIN devolucao dv ON dv.co_solicitacao_apac = s.co_seq_solicitacao_apac
LEFT JOIN medicamento me ON me.co_solicitacao_apac = s.co_seq_solicitacao_apac
LEFT JOIN apac.tb_cid c ON c.co_seq_cid = s.co_cid_principal
LEFT JOIN apac.tb_morfologia_tumoral mo ON mo.co_seq_morfologia_tumoral = s.co_morfologia_tumoral
LEFT JOIN apac.tb_tipo_estadiamento te ON te.co_seq_tipo_estadiamento = s.co_tipo_estadiamento
LEFT JOIN apac.tb_estadio_calculado ec ON ec.co_seq_estadio_calculado = s.co_estadio_clinico
LEFT JOIN apac.tb_resultado_her2 h ON h.co_seq_resultado_her2 = s.co_resultado_her2
LEFT JOIN apac.tb_pcdt pc ON pc.co_seq_pcdt = s.co_pcdt
WHERE s.dt_exclusao IS NULL AND (:escopo)
ORDER BY s.co_seq_solicitacao_apac
`;
