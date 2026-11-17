import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clone das tabelas do APAC Onco (schema dbapaconco) usadas pelo painel —
 * mesmo modelo do SIMDASH: o banco de origem é lido pelo SyncService e
 * copiado para cá (schema `apac`, mesmos nomes de tabela e coluna).
 *
 * Diferenças em relação à origem, de propósito:
 *  - sem FOREIGN KEY, UNIQUE e CHECK: a origem já valida; aqui eles só
 *    fariam o sync quebrar quando a origem ganhar um valor novo (ex.: um
 *    tp_status novo) ou durante a cópia de pai e filho;
 *  - sem DEFAULT nextval: os ids vêm da origem;
 *  - colunas de CPF guardam o valor cifrado (AES-256-GCM) → varchar(200);
 *  - tb_solicitacao_apac SEM os dados pessoais que o painel não usa
 *    (nome, nome social, nome da mãe, nascimento, CNS, endereço,
 *    município de nascimento) e COM co_paciente_hash: HMAC do CPF (ou CNS)
 *    do paciente, para contar pacientes únicos sem guardar quem é;
 *  - índices para os filtros do painel.
 *
 * Também cria sync_run (horário da última sincronização bem-sucedida) e
 * sync_run_log (auditoria de cada execução), iguais aos do SIMDASH.
 */
export class CreateApacClone1794900000000 implements MigrationInterface {
  name = 'CreateApacClone1794900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SCHEMA IF NOT EXISTS apac`);
    const tabelas = [
      `CREATE TABLE apac.tb_cid (
          co_seq_cid int8 NOT NULL,
          sg_codigo varchar(20) NOT NULL,
          ds_cid varchar(250) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_cid PRIMARY KEY (co_seq_cid)
        )`,
      `CREATE TABLE apac.tb_morfologia_tumoral (
          co_seq_morfologia_tumoral int8 NOT NULL,
          sg_codigo varchar(20) NOT NULL,
          ds_morfologia_tumoral varchar(250) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_morfologia_tumoral PRIMARY KEY (co_seq_morfologia_tumoral)
        )`,
      `CREATE TABLE apac.tb_tipo_estadiamento (
          co_seq_tipo_estadiamento int8 NOT NULL,
          sg_codigo varchar(30) NOT NULL,
          ds_tipo_estadiamento varchar(150) NOT NULL,
          tp_modo_captura varchar(30) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_tipo_estadiamento PRIMARY KEY (co_seq_tipo_estadiamento)
        )`,
      `CREATE TABLE apac.tb_estadio_calculado (
          co_seq_estadio_calculado int8 NOT NULL,
          co_tipo_estadiamento int8 NOT NULL,
          sg_codigo varchar(20) NOT NULL,
          ds_estadio_calculado varchar(100) NOT NULL,
          sg_grupo varchar(20) NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_estadio_calculado PRIMARY KEY (co_seq_estadio_calculado)
        )`,
      `CREATE TABLE apac.tb_resultado_her2 (
          co_seq_resultado_her2 int8 NOT NULL,
          sg_codigo varchar(10) NOT NULL,
          ds_resultado_her2 varchar(50) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_resultado_her2 PRIMARY KEY (co_seq_resultado_her2)
        )`,
      `CREATE TABLE apac.tb_tipo_biomarcador (
          co_seq_tipo_biomarcador int8 NOT NULL,
          sg_codigo varchar(20) NOT NULL,
          ds_tipo_biomarcador varchar(100) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_tipo_biomarcador PRIMARY KEY (co_seq_tipo_biomarcador)
        )`,
      `CREATE TABLE apac.tb_resultado_biomarcador (
          co_seq_resultado_biomarcador int8 NOT NULL,
          co_tipo_biomarcador int8 NOT NULL,
          sg_codigo varchar(40) NOT NULL,
          ds_resultado_biomarcador varchar(100) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_resultado_biomarcador PRIMARY KEY (co_seq_resultado_biomarcador)
        )`,
      `CREATE TABLE apac.tb_medicamento (
          co_seq_medicamento int8 NOT NULL,
          sg_codigo varchar(50) NOT NULL,
          co_br_obm_vtm varchar(50) NULL,
          ds_medicamento varchar(200) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          st_parametrizado varchar(1) NOT NULL,
          co_pcdt int8 NULL,
          CONSTRAINT pk_tb_medicamento PRIMARY KEY (co_seq_medicamento)
        )`,
      `CREATE TABLE apac.tb_pcdt (
          co_seq_pcdt int8 NOT NULL,
          sg_codigo varchar(80) NOT NULL,
          nu_dose_mg_kg numeric(8, 2) NOT NULL,
          ds_frequencia_padrao varchar(50) NOT NULL,
          ds_ciclos_padrao varchar(30) NOT NULL,
          ds_via_padrao varchar(50) NOT NULL,
          ds_sigtap varchar(20) NOT NULL,
          ds_procedimento varchar(250) NOT NULL,
          ds_protocolo varchar(250) NOT NULL,
          ds_linha varchar(100) NOT NULL,
          ds_finalidade varchar(50) NOT NULL,
          ds_sigtap_secundario varchar(20) NULL,
          ds_procedimento_secundario varchar(250) NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_pcdt PRIMARY KEY (co_seq_pcdt)
        )`,
      `CREATE TABLE apac.tb_param_referencia_dominio (
          co_seq_param_ref_dominio int8 NOT NULL,
          tp_dominio varchar(30) NOT NULL,
          ds_valor varchar(100) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          co_cbo_ocupacao varchar(6) NULL,
          CONSTRAINT pk_tb_param_referencia_dominio PRIMARY KEY (co_seq_param_ref_dominio)
        )`,
      `CREATE TABLE apac.tb_dominio_terapia (
          co_seq_dominio_terapia int8 NOT NULL,
          tp_dominio varchar(20) NOT NULL,
          sg_codigo varchar(50) NOT NULL,
          ds_dominio_terapia varchar(100) NOT NULL,
          nu_ordem int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          CONSTRAINT pk_tb_dominio_terapia PRIMARY KEY (co_seq_dominio_terapia)
        )`,
      `CREATE TABLE apac.tb_perfil (
          co_seq_perfil int8 NOT NULL,
          sg_perfil varchar(40) NOT NULL,
          no_perfil varchar(100) NOT NULL,
          ds_perfil varchar(255) NULL,
          st_perfil_sistema varchar(1) NOT NULL,
          tp_perfil_natureza varchar(20) NOT NULL,
          nu_ordem_precedencia int4 NOT NULL,
          st_registro_ativo varchar(1) DEFAULT 'S'::character varying NOT NULL,
          co_usuario_criacao int8 NULL,
          dt_criacao timestamptz NOT NULL,
          co_usuario_atualizacao int8 NULL,
          dt_atualizacao timestamptz NULL,
          co_usuario_exclusao int8 NULL,
          dt_exclusao timestamptz NULL,
          CONSTRAINT pk_tb_perfil PRIMARY KEY (co_seq_perfil)
        )`,
      `CREATE TABLE apac.rl_usuario_perfil (
          co_seq_usuario_perfil int8 NOT NULL,
          co_usuario int8 NOT NULL,
          co_perfil int8 NOT NULL,
          dt_criacao timestamptz NOT NULL,
          co_usuario_criacao int8 NULL,
          CONSTRAINT pk_rl_usuario_perfil PRIMARY KEY (co_seq_usuario_perfil)
        )`,
      `CREATE TABLE apac.tb_solicitacao_apac (
          co_seq_solicitacao_apac int8 NOT NULL,
          co_cnes varchar(7) NOT NULL,
          sg_uf_estabelecimento varchar(2) NULL,
          tp_status varchar(30) NOT NULL,
          co_sistema_origem varchar(30) NULL,
          nu_competencia int4 NULL,
          nu_ano_solicitacao int4 NOT NULL,
          nu_sequencial_solicitacao int4 NOT NULL,
          dt_solicitacao timestamptz NULL,
          dt_envio timestamptz NULL,
          dt_correcao timestamptz NULL,
          dt_autorizacao timestamptz NULL,
          nu_cpf_prof_solicitante varchar(200) NOT NULL,
          no_profissional_solicitante varchar(200) NOT NULL,
          nu_cpf_medico_responsavel varchar(200) NULL,
          no_medico_responsavel varchar(200) NULL,
          co_crm varchar(10) NULL,
          sg_crm_uf varchar(2) NULL,
          co_cbo varchar(6) NULL,
          ds_cbo varchar(100) NULL,
          co_cid_principal int8 NULL,
          co_morfologia_tumoral int8 NULL,
          ds_topografia_tumoral varchar(250) NULL,
          co_tipo_estadiamento int8 NULL,
          co_estadio_clinico int8 NULL,
          co_estadio_clinico_secundario int8 NULL,
          nu_breslow_mm numeric(6, 2) NULL,
          nu_pci int4 NULL,
          sg_subclassificacao_estadio varchar(5) NULL,
          ds_estadiamento varchar(250) NULL,
          ds_estadio_clinico varchar(250) NULL,
          ds_estadio_patologico varchar(20) NULL,
          nu_feve int4 NULL,
          dt_diagnostico_oncologico date NULL,
          st_recidiva varchar(1) NULL,
          co_tipo_biomarcador int8 NULL,
          co_resultado_her2 int8 NULL,
          ds_fish_resultado varchar(20) NULL,
          ds_pdl1 varchar(20) NULL,
          ds_brca varchar(20) NULL,
          ds_tratamento_sigtap varchar(500) NULL,
          ds_parecer_automatico varchar(4000) NULL,
          ds_motivo_devolucao varchar(1500) NULL,
          dt_devolucao timestamptz NULL,
          nu_peso_kg numeric(5, 1) NULL,
          nu_altura_cm int4 NULL,
          nu_superficie_corporal_m2 numeric(4, 2) NULL,
          ds_protocolo_referencia varchar(250) NULL,
          ds_linha_tratamento varchar(400) NULL,
          ds_finalidade_tratamento varchar(100) NULL,
          ds_procedimento_principal varchar(3000) NULL,
          ds_medicamento_resumo varchar(500) NULL,
          co_pcdt int8 NULL,
          ds_parecer_plano_terapeutico varchar(4000) NULL,
          st_parecer_plano_conforme varchar(1) NULL,
          dt_prescricao_medica timestamptz NULL,
          co_avaliador varchar(64) NULL,
          nu_cpf_avaliador varchar(200) NULL,
          no_avaliador varchar(200) NULL,
          dt_inicio_analise timestamptz NULL,
          tp_status_anterior_analise varchar(30) NULL,
          nu_numero_apac_inicial varchar(13) NULL,
          dt_fim_vigencia_tratamento date NULL,
          nu_cpf_paciente varchar(200) NULL,
          tp_sexo varchar(1) NULL,
          nu_idade int4 NULL,
          co_municipio_ibge varchar(7) NULL,
          no_municipio varchar(100) NULL,
          sg_uf varchar(2) NULL,
          ds_raca_cor varchar(50) NULL,
          no_etnia_indigena varchar(200) NULL,
          no_dsei varchar(200) NULL,
          no_polo_base_indigena varchar(200) NULL,
          no_pais_nascimento varchar(100) NULL,
          no_pais_residencia varchar(100) NULL,
          dt_consulta_cadsus timestamptz NULL,
          co_usuario_criacao int8 NULL,
          dt_criacao timestamptz NOT NULL,
          co_usuario_atualizacao int8 NULL,
          dt_atualizacao timestamptz NULL,
          co_usuario_exclusao int8 NULL,
          dt_exclusao timestamptz NULL,
          co_parametrizacao_versao int8 NULL,
          no_estabelecimento varchar(200) NULL,
          co_paciente_hash varchar(64) NULL,
          CONSTRAINT pk_tb_solicitacao_apac PRIMARY KEY (co_seq_solicitacao_apac)
        )`,
      `CREATE TABLE apac.tb_solicitacao_apac_parecer (
          co_seq_solic_apac_parecer int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          tp_resultado varchar(20) NOT NULL,
          ds_justificativa varchar(1500) NULL,
          dt_emissao timestamptz NOT NULL,
          co_avaliador varchar(64) NOT NULL,
          nu_cpf_avaliador varchar(200) NOT NULL,
          no_avaliador varchar(200) NOT NULL,
          CONSTRAINT pk_tb_solicitacao_apac_parecer PRIMARY KEY (co_seq_solic_apac_parecer)
        )`,
      `CREATE TABLE apac.rl_solic_apac_parecer_motivo (
          co_seq_solic_apac_parec_motivo int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          tp_motivo varchar(50) NOT NULL,
          CONSTRAINT pk_rl_solic_apac_parecer_motivo PRIMARY KEY (co_seq_solic_apac_parec_motivo)
        )`,
      `CREATE TABLE apac.tb_solicitacao_apac_devolucao (
          co_seq_solic_apac_devolucao int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          ds_justificativa varchar(1500) NOT NULL,
          dt_devolucao timestamptz NOT NULL,
          co_avaliador varchar(64) NOT NULL,
          nu_cpf_avaliador varchar(200) NOT NULL,
          no_avaliador varchar(200) NOT NULL,
          CONSTRAINT pk_tb_solicitacao_apac_devolucao PRIMARY KEY (co_seq_solic_apac_devolucao)
        )`,
      `CREATE TABLE apac.rl_solic_apac_devol_motivo (
          co_seq_solic_apac_devol_motivo int8 NOT NULL,
          co_solicitacao_apac_devolucao int8 NOT NULL,
          tp_motivo varchar(50) NOT NULL,
          CONSTRAINT pk_rl_solic_apac_devol_motivo PRIMARY KEY (co_seq_solic_apac_devol_motivo)
        )`,
      `CREATE TABLE apac.tb_solic_apac_medicamento (
          co_seq_solic_apac_medicamento int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          co_medicamento int8 NOT NULL,
          nu_ordem int4 NOT NULL,
          ds_medicamento varchar(200) NOT NULL,
          nu_dose_proposta_mg_kg numeric(8, 2) NOT NULL,
          co_dose_unidade varchar(50) NULL,
          ds_dose_unidade varchar(100) NULL,
          ds_frequencia varchar(100) NOT NULL,
          ds_frequencia_outro varchar(100) NULL,
          nu_frequencia_valor int4 NULL,
          co_frequencia_unidade varchar(50) NULL,
          ds_frequencia_unidade varchar(100) NULL,
          ds_ciclos varchar(30) NOT NULL,
          ds_via_administracao varchar(50) NOT NULL,
          ds_duracao_prevista varchar(100) NULL,
          nu_ciclo_atual int4 NULL,
          tp_dose varchar(1) NULL,
          co_via_administracao int4 NULL,
          co_periodicidade int4 NULL,
          qt_duracao int4 NULL,
          tp_medida_duracao varchar(1) NULL,
          CONSTRAINT pk_tb_solic_apac_medicamento PRIMARY KEY (co_seq_solic_apac_medicamento)
        )`,
      `CREATE TABLE apac.tb_solic_apac_cancelamento (
          co_seq_solic_apac_cancelamento int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          tp_motivo_cancelamento varchar(30) NOT NULL,
          ds_motivo_outros varchar(150) NULL,
          ds_justificativa varchar(500) NOT NULL,
          dt_cancelamento timestamptz NOT NULL,
          nu_cpf_usuario_cancelamento varchar(200) NOT NULL,
          no_usuario_cancelamento varchar(200) NOT NULL,
          CONSTRAINT pk_tb_solic_apac_cancelamento PRIMARY KEY (co_seq_solic_apac_cancelamento)
        )`,
      `CREATE TABLE apac.tb_solicitacao_apac_numero (
          co_seq_solicitacao_apac_numero int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          nu_numero_apac varchar(13) NOT NULL,
          tp_sequencia_apac varchar(20) NOT NULL,
          nu_ordem int4 NOT NULL,
          co_uf varchar(2) NOT NULL,
          nu_ano_emissao int4 NOT NULL,
          nu_sequencial int4 NOT NULL,
          dt_inicio_vigencia date NOT NULL,
          dt_fim_vigencia date NOT NULL,
          dt_emissao timestamptz NOT NULL,
          st_automatico varchar(1) NOT NULL,
          co_avaliador varchar(64) NULL,
          CONSTRAINT pk_tb_solicitacao_apac_numero PRIMARY KEY (co_seq_solicitacao_apac_numero)
        )`,
      `CREATE TABLE apac.rl_solic_apac_biomarcador (
          co_seq_solic_apac_biomarcador int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          co_campo_parametrizacao varchar(40) NULL,
          co_tipo_biomarcador int8 NOT NULL,
          co_resultado_biomarcador int8 NULL,
          nu_ordem int4 NOT NULL,
          CONSTRAINT pk_rl_solic_apac_biomarcador PRIMARY KEY (co_seq_solic_apac_biomarcador)
        )`,
      `CREATE TABLE apac.rl_solic_apac_estad_compl (
          co_seq_solic_apac_estad_compl int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          nu_ordem int4 NOT NULL,
          co_tipo_estadiamento int8 NOT NULL,
          co_estadio_clinico int8 NULL,
          co_estadio_clinico_secundario int8 NULL,
          nu_breslow_mm numeric(6, 2) NULL,
          nu_pci int4 NULL,
          sg_subclassificacao_estadio varchar(5) NULL,
          CONSTRAINT pk_rl_solic_apac_estad_compl PRIMARY KEY (co_seq_solic_apac_estad_compl)
        )`,
      `CREATE TABLE apac.rl_solic_apac_cid_secundario (
          co_seq_solic_apac_cid_secund int8 NOT NULL,
          co_solicitacao_apac int8 NOT NULL,
          co_cid int8 NOT NULL,
          nu_ordem int4 NOT NULL,
          CONSTRAINT pk_rl_solic_apac_cid_secundario PRIMARY KEY (co_seq_solic_apac_cid_secund)
        )`,
    ];
    for (const sql of tabelas) await q.query(sql);

    const indices = [
      `CREATE INDEX in_tb_solicitacao_apac_parecer_cosolicapac ON apac.tb_solicitacao_apac_parecer (co_solicitacao_apac)`,
      `CREATE INDEX in_rl_solic_apac_parecer_motivo_cosolicapac ON apac.rl_solic_apac_parecer_motivo (co_solicitacao_apac)`,
      `CREATE INDEX in_tb_solicitacao_apac_devolucao_cosolicapac ON apac.tb_solicitacao_apac_devolucao (co_solicitacao_apac)`,
      `CREATE INDEX in_tb_solic_apac_medicamento_cosolicapac ON apac.tb_solic_apac_medicamento (co_solicitacao_apac)`,
      `CREATE INDEX in_tb_solic_apac_cancelamento_cosolicapac ON apac.tb_solic_apac_cancelamento (co_solicitacao_apac)`,
      `CREATE INDEX in_tb_solicitacao_apac_numero_cosolicapac ON apac.tb_solicitacao_apac_numero (co_solicitacao_apac)`,
      `CREATE INDEX in_rl_solic_apac_biomarcador_cosolicapac ON apac.rl_solic_apac_biomarcador (co_solicitacao_apac)`,
      `CREATE INDEX in_rl_solic_apac_estad_compl_cosolicapac ON apac.rl_solic_apac_estad_compl (co_solicitacao_apac)`,
      `CREATE INDEX in_rl_solic_apac_cid_secundario_cosolicapac ON apac.rl_solic_apac_cid_secundario (co_solicitacao_apac)`,
      `CREATE INDEX in_rl_solic_apac_devol_motivo_codevol ON apac.rl_solic_apac_devol_motivo (co_solicitacao_apac_devolucao)`,
      `CREATE INDEX in_tb_solicitacao_apac_co_cnes ON apac.tb_solicitacao_apac (co_cnes)`,
      `CREATE INDEX in_tb_solicitacao_apac_tp_status ON apac.tb_solicitacao_apac (tp_status)`,
      `CREATE INDEX in_tb_solicitacao_apac_dt_solicitacao ON apac.tb_solicitacao_apac (dt_solicitacao)`,
      `CREATE INDEX in_tb_solicitacao_apac_co_municipio_ibge ON apac.tb_solicitacao_apac (co_municipio_ibge)`,
      `CREATE INDEX in_tb_solicitacao_apac_co_paciente_hash ON apac.tb_solicitacao_apac (co_paciente_hash)`,
    ];
    for (const sql of indices) await q.query(sql);

    await q.query(`
      CREATE TABLE "sync_run" (
        "id" boolean PRIMARY KEY DEFAULT true,
        "updated_at" timestamptz NOT NULL,
        CONSTRAINT "CK_sync_run_singleton" CHECK ("id")
      )
    `);
    await q.query(`
      CREATE TABLE "sync_run_log" (
        "id" SERIAL PRIMARY KEY,
        "triggered_by_id_users" integer,
        "trigger" varchar(20) NOT NULL,
        "started_at" timestamptz NOT NULL,
        "finished_at" timestamptz NOT NULL,
        "success" boolean NOT NULL,
        "error" text,
        "tables" jsonb,
        CONSTRAINT "FK_sync_run_log_triggered_by_id_users" FOREIGN KEY ("triggered_by_id_users")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_sync_run_log_started_at" ON "sync_run_log" ("started_at" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "sync_run_log"`);
    await q.query(`DROP TABLE "sync_run"`);
    await q.query(`DROP SCHEMA apac CASCADE`);
  }
}
