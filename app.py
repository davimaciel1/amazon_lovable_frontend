
import os
import time
import pandas as pd
import streamlit as st
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from contextlib import contextmanager
import matplotlib.pyplot as plt

st.set_page_config(page_title="Postgres Viewer • Ads Metrics", layout="wide")

# -------------------------------
# Helpers
# -------------------------------
def get_env_default(key: str, fallback: str = "") -> str:
    return os.getenv(key, fallback)

@st.cache_resource(show_spinner=False)
def make_engine_cached(host, port, db, user, password) -> Engine:
    """
    Keep a single Engine instance per distinct connection string.
    """
    if host and password is None:
        # small guard for accidental None password in some envs
        password = ""
    url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"
    return create_engine(url, pool_pre_ping=True)

@contextmanager
def db_conn(engine: Engine):
    conn = engine.connect()
    try:
        yield conn
    finally:
        conn.close()

# IMPORTANT: ignore the Engine when hashing cache inputs
@st.cache_data(show_spinner=False, ttl=60)
def run_query_df(_engine: Engine, sql: str, params: dict | None = None) -> pd.DataFrame:
    with db_conn(_engine) as conn:
        df = pd.read_sql(text(sql), conn, params=params)
    return df

def success(msg: str):
    st.toast(msg, icon="✅")

def warn(msg: str):
    st.toast(msg, icon="⚠️")

def fmt_num(x):
    try:
        return f"{x:,.0f}".replace(",", ".")
    except Exception:
        return x

def df_to_csv_download(df: pd.DataFrame, label: str, filename: str):
    if df.empty:
        return
    csv = df.to_csv(index=False).encode("utf-8")
    st.download_button(label=label, data=csv, file_name=filename, mime="text/csv")

# -------------------------------
# Sidebar • Connection
# -------------------------------
st.sidebar.header("Conexão com Postgres")

with st.sidebar:
    # Prefer DATABASE_URL if present
    default_dburl = os.getenv("DATABASE_URL", "")
    use_dburl = st.checkbox("Usar DATABASE_URL", value=bool(default_dburl))
    if use_dburl:
        dburl = st.text_input("DATABASE_URL", value=default_dburl, help="postgresql+psycopg2://user:pass@host:5432/dbname")
        connect_btn = st.button("Conectar", type="primary", use_container_width=True)
    else:
        host = st.text_input("Host", value=get_env_default("DB_HOST", "localhost"))
        port = st.text_input("Porta", value=get_env_default("DB_PORT", "5432"))
        db   = st.text_input("Database", value=get_env_default("DB_NAME", ""))
        user = st.text_input("Usuário", value=get_env_default("DB_USER", ""))
        pwd  = st.text_input("Senha", type="password", value=get_env_default("DB_PASSWORD", ""))
        connect_btn = st.button("Conectar", type="primary", use_container_width=True)

if "engine" not in st.session_state:
    st.session_state.engine = None

if connect_btn:
    try:
        if 'use_dburl' in locals() and use_dburl:
            # Parse DATABASE_URL minimally (Streamlit keeps the engine cached by URL)
            st.session_state.engine = create_engine(dburl, pool_pre_ping=True)
        else:
            st.session_state.engine = make_engine_cached(host, port, db, user, pwd)
        # simple ping (no cache to avoid masking connection issues)
        with st.session_state.engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1;")
        success("Conectado com sucesso ao Postgres!")
    except Exception as e:
        st.session_state.engine = None
        st.error(f"Falha na conexão: {e}")

engine = st.session_state.engine
if engine is None:
    st.info("💡 Preencha as credenciais na barra lateral e clique **Conectar**. "
            "Você também pode definir `DATABASE_URL` ou as variáveis: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.")
    st.stop()

# -------------------------------
# Tabs
# -------------------------------
tab1, tab2, tab3 = st.tabs(["📊 Métricas de Ads (SP)", "🧭 Navegar Tabelas", "🧪 SQL Livre"])

# -------------------------------
# Tab 1 • Ads Metrics (vw_sp_campaign_metrics_per_product)
# -------------------------------
with tab1:
    st.subheader("Sponsored Products • Campaign Metrics per Product")

    # Detecta view
    exists_sql = """
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'vw_sp_campaign_metrics_per_product'
    ) AS exists_view;
    """
    try:
        ex_df = run_query_df(engine, exists_sql)
        has_view = bool(ex_df.iloc[0]["exists_view"])
    except Exception as e:
        has_view = False
        st.error(f"Erro verificando a view: {e}")

    if not has_view:
        st.warning("View `public.vw_sp_campaign_metrics_per_product` não encontrada. "
                   "Use o SQL abaixo para criar a view (ajuste nomes de colunas/tabela conforme seu schema).")
        st.code("""
CREATE OR REPLACE VIEW public.vw_sp_campaign_metrics_per_product AS
SELECT
  date,
  campaign_id,
  campaign_name,
  advertised_asin,
  advertised_sku,
  SUM(impressions)                AS impressions,
  SUM(clicks)                     AS clicks,
  SUM(cost)                       AS spend,
  SUM(attributed_sales_14d)       AS sales_14d,
  SUM(attributed_conversions_14d) AS conv_14d
FROM ads_sp_advertised_product_daily
GROUP BY 1,2,3,4,5;
        """, language="sql")
        st.stop()

    # Filtros dinâmicos
    meta_sql = """
    SELECT
      MIN(date) AS min_date,
      MAX(date) AS max_date
    FROM public.vw_sp_campaign_metrics_per_product;
    """
    md = run_query_df(engine, meta_sql)
    min_d = pd.to_datetime(md.iloc[0]["min_date"]) if not md.empty else None
    max_d = pd.to_datetime(md.iloc[0]["max_date"]) if not md.empty else None

    # Listas
    campaigns = run_query_df(engine, "SELECT DISTINCT campaign_name FROM public.vw_sp_campaign_metrics_per_product ORDER BY 1;")["campaign_name"].tolist()
    asins = run_query_df(engine, "SELECT DISTINCT advertised_asin FROM public.vw_sp_campaign_metrics_per_product ORDER BY 1;")["advertised_asin"].tolist()

    c1, c2, c3 = st.columns([1.2, 1, 1])
    with c1:
        if min_d is not None and max_d is not None:
            date_range = st.date_input("Período", value=(min_d.date(), max_d.date()))
        else:
            date_range = st.date_input("Período")
    with c2:
        sel_campaigns = st.multiselect("Campaign(s)", campaigns, default=[])
    with c3:
        sel_asins = st.multiselect("ASIN(s)", asins, default=[])

    params = {}
    where = ["1=1"]
    if isinstance(date_range, tuple) and len(date_range) == 2 and date_range[0] and date_range[1]:
        where.append("date BETWEEN :dstart AND :dend")
        params["dstart"] = str(date_range[0])
        params["dend"] = str(date_range[1])
    if sel_campaigns:
        where.append("campaign_name = ANY(:camps)")
        params["camps"] = sel_campaigns
    if sel_asins:
        where.append("advertised_asin = ANY(:asins)")
        params["asins"] = sel_asins

    base_sql = f"""
    SELECT date, campaign_id, campaign_name, advertised_asin, advertised_sku,
           impressions, clicks, spend, sales_14d, conv_14d
    FROM public.vw_sp_campaign_metrics_per_product
    WHERE {' AND '.join(where)}
    ORDER BY date ASC;
    """
    data = run_query_df(engine, base_sql, params)

    if data.empty:
        st.info("Sem dados para os filtros selecionados.")
    else:
        # KPIs
        k1, k2, k3, k4, k5, k6 = st.columns(6)
        impressions = int(data["impressions"].sum())
        clicks = int(data["clicks"].sum())
        spend = float(data["spend"].sum())
        sales = float(data["sales_14d"].sum())
        conv = float(data["conv_14d"].sum())
        ctr = (clicks / impressions * 100) if impressions else 0.0
        cpc = (spend / clicks) if clicks else 0.0
        acos = (spend / sales * 100) if sales else 0.0
        roas = (sales / spend) if spend else 0.0

        k1.metric("Impressions", fmt_num(impressions))
        k2.metric("Clicks", fmt_num(clicks), f"{ctr:.2f}% CTR")
        k3.metric("Spend", f"${spend:,.2f}")
        k4.metric("Sales 14d", f"${sales:,.2f}")
        k5.metric("Conv 14d", fmt_num(conv))
        k6.metric("ROAS", f"{roas:.2f}x", f"ACOS {acos:.2f}%")

        st.divider()
        st.subheader("Séries temporais")

        data["date"] = pd.to_datetime(data["date"])
        agg = data.groupby("date", as_index=False).agg({
            "impressions": "sum",
            "clicks": "sum",
            "spend": "sum",
            "sales_14d": "sum",
            "conv_14d": "sum"
        })

        # Plot: Spend
        fig1 = plt.figure()
        plt.plot(agg["date"], agg["spend"])
        plt.title("Spend por dia")
        plt.xlabel("Data")
        plt.ylabel("Spend")
        st.pyplot(fig1, clear_figure=True)

        # Plot: Sales
        fig2 = plt.figure()
        plt.plot(agg["date"], agg["sales_14d"])
        plt.title("Sales 14d por dia")
        plt.xlabel("Data")
        plt.ylabel("Sales 14d")
        st.pyplot(fig2, clear_figure=True)

        # Plot: Clicks
        fig3 = plt.figure()
        plt.plot(agg["date"], agg["clicks"])
        plt.title("Clicks por dia")
        plt.xlabel("Data")
        plt.ylabel("Clicks")
        st.pyplot(fig3, clear_figure=True)

        st.divider()
        st.subheader("Tabela detalhada")
        st.dataframe(data, use_container_width=True)
        df_to_csv_download(data, "⬇️ Baixar CSV (filtros atuais)", "ads_metrics_filtered.csv")

# -------------------------------
# Tab 2 • Browser
# -------------------------------
with tab2:
    st.subheader("Explorar tabelas")

    schemas = run_query_df(engine, """
        SELECT nspname AS schema_name
        FROM pg_namespace
        WHERE nspname NOT IN ('pg_catalog','information_schema')
        ORDER BY 1;
    """)["schema_name"].tolist()

    col1, col2 = st.columns(2)
    with col1:
        schema = st.selectbox("Schema", schemas, index=schemas.index("public") if "public" in schemas else 0)
        tables = run_query_df(engine, """
            SELECT tablename FROM pg_tables WHERE schemaname = :s ORDER BY 1;
        """, {"s": schema})["tablename"].tolist()
    with col2:
        table = st.selectbox("Tabela", tables if tables else ["(nenhuma)"])

    limit = st.number_input("Limite", min_value=10, max_value=100000, value=1000, step=50)

    if tables and table and table != "(nenhuma)":
        try:
            preview_sql = f'SELECT * FROM "{schema}"."{table}" LIMIT :lim;'
            preview = run_query_df(engine, preview_sql, {"lim": int(limit)})
            st.dataframe(preview, use_container_width=True)
            df_to_csv_download(preview, "⬇️ Baixar CSV", f"{schema}.{table}.csv")
        except Exception as e:
            st.error(f"Erro ao carregar a tabela: {e}")

# -------------------------------
# Tab 3 • SQL livre
# -------------------------------
with tab3:
    st.subheader("Editor SQL")
    default_sql = "SELECT NOW() as now;"
    sql = st.text_area("SQL", height=200, value=default_sql)
    run_btn = st.button("Executar consulta")

    if run_btn and sql.strip():
        t0 = time.time()
        try:
            out = run_query_df(engine, sql)
            dur = (time.time() - t0) * 1000
            st.caption(f"Tempo: {dur:.0f} ms • Linhas: {len(out)}")
            st.dataframe(out, use_container_width=True)
            df_to_csv_download(out, "⬇️ Baixar CSV", "resultado_sql.csv")
        except Exception as e:
            st.error(f"Erro na consulta: {e}")
