(function(){
  // a senha de admin não fica mais aqui no código — agora é uma conta de verdade no Supabase Auth (ver instruções de segurança)

  // ---------- conexão com o banco de dados (Supabase) ----------
  const SUPABASE_URL = "https://fgbmvagormiwgdkkiqda.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DPHmmsLWAwopwAtv_aoPuA_72GLjuHT";
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const ADMIN_WHATSAPP_NUMBER = "5534999416973"; // (34) 99941-6973
  const ADMIN_EMAIL = "hl3dsolutions@gmail.com";
  const INSTAGRAM_URL = "https://instagram.com/hl3dsolutions";
  const MERCADO_LIVRE_URL = "https://lista.mercadolivre.com.br/_CustId_3261421782";
  // O painel administrativo não faz parte da navegação pública. Ele só é ativado
  // quando esta página é aberta dentro do portal interno de Ferramentas.
  const INTERNAL_ADMIN_MODE = new URLSearchParams(location.search).get('internal') === 'admin' && window.self !== window.top;
  if(INTERNAL_ADMIN_MODE) document.body.classList.add('internal-admin-mode');

  const root = document.getElementById('portal-root');
  const fmtMoney = v => 'R$ ' + (Number(v)||0).toFixed(2).replace('.', ',');
  // impede que texto digitado por qualquer pessoa (parceiro, visitante) vire código executável quando exibido na tela
  function escapeHtml(str){
    if(str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const todayISO = () => {
    const d=new Date(),pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };
  function nextSeqId(list, prefix){
    let maxNum = 0;
    const re = new RegExp('^' + prefix + '-(\\d+)$');
    list.forEach(item=>{
      const m = re.exec(item.id);
      if(m){ const n = parseInt(m[1], 10); if(n > maxNum) maxNum = n; }
    });
    return prefix + '-' + String(maxNum + 1).padStart(3, '0');
  }
  const fmtDate = iso => { if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };
  const fmtDateTime = ts => {
    if(!ts) return null;
    const d = new Date(ts);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  let PRODUCTS = [], CLIENTS = [], ENTREGAS = [], DEVOLUCOES = [], ACERTOS = [], PEDIDOS = [], DOCUMENTS = [], VENDAS = [], PARTNER_ACTIONS = [], CALCULATIONS = [], PRODUCT_COST_LINKS = [], STOCK_MOVEMENTS = [], PRODUCT_DIRECT_COSTS = {};
  let PUBLIC_PRODUCTS = [], PUBLIC_CATEGORIES = [], PUBLIC_SALES = [];
  let currentClientCode = null;
  let modalSelectedColor = null;
  let KNOWN_CATEGORIES = [];
  let pendingCategories = [];
  let pendingGallery = [];
  let pendingColors = [];
  let MEDIA_FILES = [];
  let mediaLoaded = false;
  let mediaSearch = '';
  let mediaStatus = 'all';
  let mediaSort = 'recent';
  const MEDIA_CAPACITY_KEY = 'hl_media_capacity_mb';
  let mediaCapacityMb = Number(localStorage.getItem(MEDIA_CAPACITY_KEY)) || 1024;
  let qualitySearch = '';
  let qualityStatus = 'attention';
  let qualitySort = 'score';
  let editingProductCode = null;
  let editingClientCode = null;
  let currentPartnerToken = null;
  const CALCULATIONS_KEY='custos_calculos_salvos';
  const PRODUCT_COST_LINKS_KEY='product_cost_links';
  const STOCK_MOVEMENTS_KEY='stock_movements';
  const PRODUCT_DIRECT_COSTS_KEY='product_direct_costs';
  const PRODUCT_IMAGE_BUCKET='product-images';
  const HISTORICAL_SNAPSHOT_KEY='historical_price_snapshot_v1';
  const readFailures=new Set();
  const dataVersions=new Map();
  let structuredBackend=null;
  let historicalSnapshotsChecked=false;

  function isMissingSecurityFunction(error){
    const detail=`${error?.code||''} ${error?.message||''}`.toLowerCase();
    return detail.includes('pgrst202')||detail.includes('42883')||detail.includes('could not find the function')||detail.includes('does not exist');
  }

  async function loadPublicCatalog(){
    const {data,error}=await supabaseClient.rpc('get_public_catalog');
    let payload;
    if(error){
      if(!isMissingSecurityFunction(error))throw error;
      const [products,categories]=await Promise.all([getJSON('products',[]),getJSON('categories',[])]);
      payload={products,categories,sales:[]};
    }else payload=typeof data==='string'?JSON.parse(data):data;
    PUBLIC_PRODUCTS=Array.isArray(payload?.products)?payload.products:[];
    PUBLIC_CATEGORIES=Array.isArray(payload?.categories)?payload.categories:[];
    PUBLIC_SALES=Array.isArray(payload?.sales)?payload.sales:[];
    PRODUCTS=PUBLIC_PRODUCTS;
    KNOWN_CATEGORIES=PUBLIC_CATEGORIES;
    ACERTOS=PUBLIC_SALES;
  }

  function applyPartnerSnapshot(payload){
    if(!payload?.client)return false;
    PRODUCTS=Array.isArray(payload.products)?payload.products:PRODUCTS;
    CLIENTS=[payload.client];
    ENTREGAS=Array.isArray(payload.entregas)?payload.entregas:[];
    DEVOLUCOES=Array.isArray(payload.devolucoes)?payload.devolucoes:[];
    ACERTOS=Array.isArray(payload.acertos)?payload.acertos:[];
    PEDIDOS=Array.isArray(payload.pedidos)?payload.pedidos:[];
    DOCUMENTS=Array.isArray(payload.documents)?payload.documents:[];
    VENDAS=Array.isArray(payload.vendas)?payload.vendas:[];
    PARTNER_ACTIONS=Array.isArray(payload.partnerActions)?payload.partnerActions:[];
    currentClientCode=payload.client.code;
    return true;
  }

  async function loadPartnerSnapshot(code,currentToken){
    const token=currentToken||currentPartnerToken;
    if(!token)return false;
    const {data,error}=await supabaseClient.rpc('get_partner_snapshot_secure',{p_access_token:token});
    if(error)throw error;
    const payload=typeof data==='string'?JSON.parse(data):data;
    return applyPartnerSnapshot(payload);
  }

  function getCategories(p){
    if(p.categories && p.categories.length) return p.categories;
    if(p.category) return [p.category];
    return [];
  }
  function isPubliclySellable(p){return !!p&&p.active!==false&&Number(p.publicPrice)>0;}
  function isConsignmentAvailable(p){return !!p&&p.consignmentAvailable!==false;}

  async function loadAll(){
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!INTERNAL_ADMIN_MODE||!session){
      await loadPublicCatalog();
      CLIENTS=[];ENTREGAS=[];DEVOLUCOES=[];PEDIDOS=[];DOCUMENTS=[];VENDAS=[];PARTNER_ACTIONS=[];
      return;
    }
    await refreshData();
    await ensureHistoricalPriceSnapshots();

    if(PRODUCTS.length === 0 && CLIENTS.length === 0){
      // seed inicial de demonstração, consistente com o contrato e a planilha
      PRODUCTS = [
        {code:'P001', name:'Chaveiro 3D Personagem', categories:['Chaveiro 3D'], price:8.00, image:''},
        {code:'P002', name:'Chaveiro 3D Nome Personalizado', categories:['Chaveiro 3D'], price:9.00, image:''},
        {code:'P003', name:'Fidget Pop Simples', categories:['Fidget'], price:6.00, image:''},
        {code:'P004', name:'Fidget Slider', categories:['Fidget'], price:7.50, image:''},
        {code:'P005', name:'Brinquedo Sensorial Textura', categories:['Sensorial'], price:10.00, image:''},
      ];
      CLIENTS = [{code:'C001', name:'Maria Loja de Presentes', contact:'(34) 90000-0000'}];
      ENTREGAS = [withMovementSnapshot({id:'ENT-001', date:'2026-03-03', clientCode:'C001', productCode:'P001', qty:10},'consignment','seed')];
      KNOWN_CATEGORIES = ['Chaveiro 3D','Fidget','Sensorial'];
      await saveAll();
      await setJSON('categories', KNOWN_CATEGORIES);
    }
    if(KNOWN_CATEGORIES.length === 0){
      // reconstrói a lista a partir dos produtos já cadastrados, se ainda não existir
      const set = new Set();
      PRODUCTS.forEach(p=>getCategories(p).forEach(c=>set.add(c)));
      KNOWN_CATEGORIES = [...set];
      if(KNOWN_CATEGORIES.length) await setJSON('categories', KNOWN_CATEGORIES);
    }
    // adiciona as categorias sugeridas que ainda não existem na lista, sem duplicar
    const suggestedCategories = ['Chaveiros','Brinquedos','Fidgets','Pets / Mascotes','Flexíveis / Articulados','Decoração','Utilidades','Personalizados sob encomenda','Colecionáveis','Vasos / Ornamentos','Personalizável'];
    const missingCategories = suggestedCategories.filter(c=>!KNOWN_CATEGORIES.includes(c));
    if(missingCategories.length){
      KNOWN_CATEGORIES = [...KNOWN_CATEGORIES, ...missingCategories];
      await setJSON('categories', KNOWN_CATEGORIES);
    }
  }
  async function refreshData(){
    PRODUCTS = await getJSON('products', PRODUCTS);
    CLIENTS = await getJSON('clients', CLIENTS);
    ENTREGAS = await getJSON('entregas', ENTREGAS);
    DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
    ACERTOS = await getJSON('acertos', ACERTOS);
    PEDIDOS = await getJSON('pedidos', PEDIDOS);
    KNOWN_CATEGORIES = await getJSON('categories', KNOWN_CATEGORIES);
    DOCUMENTS = await getJSON('documents', DOCUMENTS);
    VENDAS = await getJSON('vendas', VENDAS);
    PARTNER_ACTIONS = await getJSON('partner_actions', PARTNER_ACTIONS);
    CALCULATIONS = await getJSON(CALCULATIONS_KEY, CALCULATIONS);
    PRODUCT_COST_LINKS = await getJSON(PRODUCT_COST_LINKS_KEY, PRODUCT_COST_LINKS);
    STOCK_MOVEMENTS = await getJSON(STOCK_MOVEMENTS_KEY, STOCK_MOVEMENTS);
    PRODUCT_DIRECT_COSTS = await getJSON(PRODUCT_DIRECT_COSTS_KEY, PRODUCT_DIRECT_COSTS);
  }
  async function saveAll(){
    await setJSON('products', PRODUCTS);
    await setJSON('clients', CLIENTS);
    await setJSON('entregas', ENTREGAS);
    await setJSON('devolucoes', DEVOLUCOES);
    await setJSON('acertos', ACERTOS);
    await setJSON('pedidos', PEDIDOS);
  }
  async function getJSON(key, fallback){
    try{
      if(structuredBackend!==false){
        const rpc=await supabaseClient.rpc('hl_get_data',{p_key:key});
        if(!rpc.error){
          structuredBackend=true;const payload=typeof rpc.data==='string'?JSON.parse(rpc.data):rpc.data;
          dataVersions.set(key,Number(payload?.version)||0);readFailures.delete(key);return payload?.value ?? fallback;
        }
        if(!isMissingSecurityFunction(rpc.error))throw rpc.error;
        structuredBackend=false;
      }
      const { data, error } = await supabaseClient.from('kv_store').select('value').eq('key', key).maybeSingle();
      if(error) throw error;
      readFailures.delete(key);
      return data ? data.value : fallback;
    }catch(e){ readFailures.add(key);console.error('Falha ao carregar', key, e); throw new Error(`Não foi possível carregar ${key}. Verifique sua conexão e tente novamente.`); }
  }
  async function setJSON(key, value){
    if(readFailures.has(key))throw new Error(`A gravação de ${key} foi bloqueada porque os dados não foram carregados com segurança.`);
    activeSaveCount++;if(activeSaveCount===1){saveBatchFailed=false;setSaveState('saving','Salvando…');}
    try{
      const write=async()=>{
        if(structuredBackend!==false){
          const {data,error}=await supabaseClient.rpc('hl_set_data',{p_key:key,p_value:value,p_expected_version:dataVersions.has(key)?dataVersions.get(key):null});
          if(!error){structuredBackend=true;const payload=typeof data==='string'?JSON.parse(data):data;dataVersions.set(key,Number(payload?.version)||0);return;}
          if(!isMissingSecurityFunction(error)){
            if(String(error.message||'').includes('HL_VERSION_CONFLICT'))throw new Error(`Os dados de ${key} foram alterados em outro aparelho ou aba. Recarregue antes de salvar novamente.`);
            throw error;
          }
          structuredBackend=false;
        }
        const {error}=await supabaseClient.from('kv_store').upsert({key,value,updated_at:new Date().toISOString()});if(error)throw error;
      };
      if(navigator.locks?.request)await navigator.locks.request(`hl-kv-${key}`,write);else await write();
      return true;
    }catch(e){saveBatchFailed=true;console.error('Falha ao salvar',key,e);if(String(e.message||'').includes('outro aparelho ou aba'))throw e;throw new Error(`Não foi possível salvar ${key}. Os dados preenchidos foram mantidos.`);}
    finally{activeSaveCount=Math.max(0,activeSaveCount-1);if(activeSaveCount===0)setSaveState(saveBatchFailed?'error':'saved',saveBatchFailed?'Falha ao salvar':'Salvo');}
  }
  async function saveJSONBundle(changes,reason='operação integrada'){
    const entries=Object.entries(changes),before={};
    const blocked=entries.find(([key])=>readFailures.has(key));
    if(blocked)throw new Error(`A gravação de ${blocked[0]} foi bloqueada porque os dados não foram carregados com segurança.`);
    if(structuredBackend!==false){
      setSaveState('saving','Salvando…');
      const expectedVersions=Object.fromEntries(entries.filter(([key])=>dataVersions.has(key)).map(([key])=>[key,dataVersions.get(key)]));
      const {data,error}=await supabaseClient.rpc('hl_set_bundle',{p_changes:changes,p_expected_versions:expectedVersions});
      if(!error){
        structuredBackend=true;const payload=typeof data==='string'?JSON.parse(data):data;
        Object.entries(payload?.versions||{}).forEach(([key,version])=>dataVersions.set(key,Number(version)||0));
        setSaveState('saved','Salvo');return true;
      }
      if(!isMissingSecurityFunction(error)){
        setSaveState('error','Falha ao salvar');
        if(String(error.message||'').includes('HL_VERSION_CONFLICT'))throw new Error('Os dados foram alterados em outro aparelho ou aba. Recarregue antes de repetir esta operação.');
        throw new Error(`Não foi possível concluir a ${reason}. Nenhuma alteração foi aplicada.`);
      }
      structuredBackend=false;
    }
    for(const [key] of entries)before[key]=await getJSON(key,null);
    const written=[];
    try{
      for(const [key,value] of entries){await setJSON(key,value);written.push(key);}
      return true;
    }catch(error){
      let restored=true;
      for(const key of written.reverse()){try{await setJSON(key,before[key]);}catch(rollbackError){restored=false;console.error('Falha ao restaurar',key,rollbackError);}}
      setSaveState('error','Falha ao salvar');
      throw new Error(`${error.message} ${restored?'As alterações parciais foram desfeitas.':`A ${reason} ficou incompleta; recarregue os dados antes de continuar.`}`);
    }
  }
  window.addEventListener('unhandledrejection',event=>{
    if(event.reason instanceof Error){event.preventDefault();alert(event.reason.message);}
  });
  let saveStateTimer=null,activeSaveCount=0,saveBatchFailed=false;
  function setSaveState(state,text){
    clearTimeout(saveStateTimer);document.querySelectorAll('#global-save-state,#admin-save-state').forEach(el=>{el.className=`save-state ${state||''}`;el.textContent=text||'Pronto';});
    if(state==='saved')saveStateTimer=setTimeout(()=>document.querySelectorAll('#global-save-state,#admin-save-state').forEach(el=>{el.className='save-state';el.textContent='Pronto';}),2400);
  }
  function showToast(message,type='ok'){
    const region=document.getElementById('toast-region');if(!region)return;
    const toast=document.createElement('div');toast.className=`ui-toast ${type==='error'?'error':''}`;toast.setAttribute('role',type==='error'?'alert':'status');
    const copy=document.createElement('span');copy.textContent=String(message);const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Fechar aviso');close.textContent='×';close.addEventListener('click',()=>toast.remove());toast.append(copy,close);region.appendChild(toast);setTimeout(()=>toast.remove(),5200);
  }
  window.alert=message=>showToast(message,/erro|não foi possível|incorret|inválid|falh/i.test(String(message))?'error':'ok');

  // ---------- navegação principal ----------
  function switchPublicView(viewName, shouldScroll = true){
    root.querySelectorAll('nav button[data-view]').forEach(btn=>{
      const active = btn.dataset.view === viewName;
      btn.classList.toggle('active', active);
      if(active) btn.setAttribute('aria-current','page');
      else btn.removeAttribute('aria-current');
    });
    root.querySelectorAll('[data-mobile-view]').forEach(btn=>{
      const active=btn.dataset.mobileView===viewName;
      btn.classList.toggle('active',active);
      if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
    });
    root.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));
    const target = document.getElementById('view-'+viewName);
    if(!target) return;
    target.classList.add('active');
    if(viewName === 'client' && currentClientCode) openClientDashboard(currentClientCode);
    if(viewName === 'admin') checkAdminSessionAndShow();
    if(shouldScroll) window.scrollTo({top:0, behavior:'smooth'});
  }
  root.querySelectorAll('nav button[data-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>switchPublicView(btn.dataset.view));
  });
  root.querySelectorAll('[data-open-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>switchPublicView(btn.dataset.openView));
  });
  root.querySelectorAll('[data-mobile-view]').forEach(btn=>{
    btn.addEventListener('click',()=>switchPublicView(btn.dataset.mobileView));
  });
  root.querySelectorAll('[data-footer-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>switchPublicView(btn.dataset.footerView));
  });

  // ---------- PORTFÓLIO ----------
  let currentCategoryFilter = 'Todos';
  let portfolioSearchQuery = '';
  let portfolioSortOrder = 'relevancia';
  const RECENT_PRODUCTS_KEY = 'hl_recent_products';
  const CATALOG_STATE_KEY = 'hl_catalog_state';
  const CATALOG_SCROLL_KEY = 'hl_catalog_scroll';
  try{
    const savedCatalogState=JSON.parse(sessionStorage.getItem(CATALOG_STATE_KEY)||'null');
    if(savedCatalogState){
      currentCategoryFilter=savedCatalogState.category||'Todos';
      portfolioSearchQuery=savedCatalogState.query||'';
      portfolioSortOrder=savedCatalogState.sort||'relevancia';
    }
  }catch(e){}
  function saveCatalogState(){
    try{sessionStorage.setItem(CATALOG_STATE_KEY,JSON.stringify({category:currentCategoryFilter,query:portfolioSearchQuery,sort:portfolioSortOrder}));}catch(e){}
  }
  const LOW_STOCK_THRESHOLD = 3;
  let consigSearchQuery = '';
  const tagClass = { 'Chaveiro 3D':'teal', 'Fidget':'coral', 'Sensorial':'mustard' };
  const TAG_PALETTE = ['teal','coral','mustard'];
  function tagColorFor(cat){
    if(tagClass[cat]) return tagClass[cat];
    let hash = 0;
    for(let i=0;i<cat.length;i++) hash = (hash*31 + cat.charCodeAt(i)) >>> 0;
    return TAG_PALETTE[hash % TAG_PALETTE.length];
  }
  function tagsHtml(p){
    const cats = getCategories(p).filter(c => c !== CUSTOMIZABLE_CATEGORY);
    if(cats.length === 0) return `<span class="tag teal">Produto</span>`;
    return cats.map(c=>`<span class="tag ${tagColorFor(c)}">${c}</span>`).join(' ');
  }

  function getPublicPrice(p,colorName){
    const color=colorName?(p.colors||[]).find(item=>item.name===colorName):null;
    const colorPrice=Number(color?.publicPrice);
    if(color?.publicPrice!=null&&colorPrice>0)return colorPrice;
    return p.publicPrice!=null?Number(p.publicPrice):Number(p.price);
  }
  function getPromoInfo(p, colorName){
    const base = getPublicPrice(p,colorName);
    let promo = null;
    if(colorName){
      const c = (p.colors || []).find(c => c.name === colorName);
      if(c && c.promoPrice != null && Number(c.promoPrice) > 0) promo = Number(c.promoPrice);
    }
    if(promo == null && p.promoPrice != null && Number(p.promoPrice) > 0) promo = Number(p.promoPrice);
    if(promo != null && base > 0 && promo < base){
      const pct = Math.round((1 - promo / base) * 100);
      return { base, promo, pct };
    }
    return null;
  }
  function hasAnyPromo(p){
    if(getPromoInfo(p)) return true;
    return (p.colors || []).some(c => getPromoInfo(p, c.name));
  }

  function renderPortfolioFilters(active){
    const set = new Set();
    active.forEach(p=>getCategories(p).forEach(c=>set.add(c)));
    const cats = ['Todos', ...Array.from(set)];
    if(!cats.includes(currentCategoryFilter)) currentCategoryFilter = 'Todos';
    document.getElementById('cat-dropdown-current').textContent = currentCategoryFilter;
    document.getElementById('portfolio-filters').innerHTML = cats.map(c=>`
      <button type="button" data-cat="${escapeHtml(c)}" class="${c===currentCategoryFilter?'active':''}">${escapeHtml(c)}</button>
    `).join('');
    document.querySelectorAll('#portfolio-filters button').forEach(b=>{
      b.addEventListener('click', ()=>{
        currentCategoryFilter = b.dataset.cat;
        saveCatalogState();
        document.getElementById('cat-dropdown-wrap').classList.remove('open');
        document.getElementById('cat-dropdown-toggle').setAttribute('aria-expanded','false');
        renderPortfolio();
      });
    });
  }
  document.getElementById('cat-dropdown-toggle').addEventListener('click', (e)=>{
    e.stopPropagation();
    const wrap=document.getElementById('cat-dropdown-wrap'),open=wrap.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded',String(open));
  });
  document.addEventListener('click', (e)=>{
    const wrap = document.getElementById('cat-dropdown-wrap');
    if(wrap && wrap.classList.contains('open') && !wrap.contains(e.target)){
      wrap.classList.remove('open');
      document.getElementById('cat-dropdown-toggle').setAttribute('aria-expanded','false');
    }
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    const wrap = document.getElementById('cat-dropdown-wrap');
    if(wrap && wrap.classList.contains('open')){
      wrap.classList.remove('open');
      const toggle = document.getElementById('cat-dropdown-toggle');
      toggle.setAttribute('aria-expanded','false');
      toggle.focus();
    }
  });

  function carouselCardHtml(r, rank, isTop, mode){
    const clickAction = mode === 'consignado'
      ? `window.hlAddToCart('${r.p.code}','${((r.p.colors||[])[0]?.name||'').replace(/'/g,"")}')`
      : `window.hlOpenProduct('${r.p.code}')`;
    return `
      <div class="carousel-card ${isTop ? 'top' : ''}" onclick="${clickAction}">
        <div class="carousel-rank">${rank}</div>
        <div class="carousel-img" style="${r.p.image ? `background-image:url('${r.p.image.replace(/'/g,"")}')` : ''}">${r.p.image ? '' : 'sem foto'}</div>
        <div class="carousel-body">
          <div class="carousel-name">${escapeHtml(r.p.name)}</div>
          <div class="carousel-count">${mode === 'consignado' ? '+ Adicionar ao carrinho' : r.qty + ' vendidas'}</div>
        </div>
      </div>`;
  }

  function renderPromoCarousel(wrapId, listId, mode){
    const wrap = document.getElementById(wrapId);
    if(!wrap) return;
    const promoProducts = PRODUCTS.filter(p => (mode==='consignado' ? p.active!==false&&isConsignmentAvailable(p) : isPubliclySellable(p)) && hasAnyPromo(p));
    if(promoProducts.length === 0){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const clickBase = mode === 'consignado' ? null : null;
    document.getElementById(listId).innerHTML = promoProducts.map(p=>{
      // se o produto todo estiver em promoção, usa esse valor; senão, mostra a melhor promoção entre as cores
      let info = getPromoInfo(p);
      let colorLabel = '';
      let promoImage = p.image;
      if(!info){
        const colorInfos = (p.colors||[]).map(c=>({ name:c.name, image:c.image, info:getPromoInfo(p, c.name) })).filter(x=>x.info);
        colorInfos.sort((a,b)=>a.info.promo - b.info.promo);
        if(colorInfos.length){
          info = colorInfos[0].info;
          colorLabel = ` (cor ${colorInfos[0].name})`;
          // usa a foto dessa cor específica, se tiver; senão cai pra foto principal do produto
          if(colorInfos[0].image) promoImage = colorInfos[0].image;
        }
      }
      if(!info) return '';
      const firstColorEncoded=encodeURIComponent((p.colors||[])[0]?.name||'').replace(/'/g,'%27');
      const clickAction = mode === 'consignado'
        ? `window.hlAddToCart('${p.code}',decodeURIComponent('${firstColorEncoded}'))`
        : `window.hlOpenProduct('${p.code}')`;
      return `
      <div class="carousel-card promo-card" onclick="${clickAction}">
        <div class="promo-ribbon">🔥 -${info.pct}%</div>
        <div class="carousel-img" style="${promoImage ? `background-image:url('${promoImage.replace(/'/g,"")}')` : ''}">${promoImage ? '' : 'sem foto'}</div>
        <div class="carousel-body">
          <div class="carousel-name">${escapeHtml(p.name)}${escapeHtml(colorLabel)}</div>
          <div class="promo-carousel-price">
            <span class="promo-old-price">${fmtMoney(info.base)}</span>
            <span class="promo-new-price">${fmtMoney(info.promo)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  const NEW_ARRIVAL_DAYS = 30;
  function renderNewArrivalsCarousel(wrapId, listId){
    const wrap = document.getElementById(wrapId);
    if(!wrap) return;
    const cutoff = Date.now() - NEW_ARRIVAL_DAYS * 24 * 60 * 60 * 1000;
    const newProducts = PRODUCTS
      .filter(p => isPubliclySellable(p) && p.createdAt && p.createdAt >= cutoff)
      .sort((a,b) => b.createdAt - a.createdAt)
      .slice(0, 4);
    if(newProducts.length === 0){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    document.getElementById(listId).innerHTML = newProducts.map(p=>{
      const displayPrice = p.publicPrice != null ? p.publicPrice : p.price;
      return `
      <div class="carousel-card new-card" onclick="window.hlOpenProduct('${p.code}')">
        <div class="new-ribbon">🆕 novo</div>
        <div class="carousel-img" style="${p.image ? `background-image:url('${p.image.replace(/'/g,"")}')` : ''}">${p.image ? '' : 'sem foto'}</div>
        <div class="carousel-body">
          <div class="carousel-name">${escapeHtml(p.name)}</div>
          <div class="carousel-count">${fmtMoney(displayPrice)}</div>
        </div>
      </div>`;
    }).join('');
  }

  function rememberRecentProduct(code){
    try{
      const recent=JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY)||'[]').filter(item=>item!==code);
      recent.unshift(code);
      localStorage.setItem(RECENT_PRODUCTS_KEY,JSON.stringify(recent.slice(0,8)));
    }catch(e){}
  }
  function renderRecentlyViewed(){
    const wrap=document.getElementById('recently-viewed-wrap'),list=document.getElementById('recently-viewed-carousel');
    if(!wrap||!list)return;
    let codes=[];try{codes=JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY)||'[]');}catch(e){}
    const products=codes.map(code=>PRODUCTS.find(p=>p.code===code)).filter(isPubliclySellable).slice(0,8);
    if(!products.length){wrap.style.display='none';return;}
    wrap.style.display='block';
    list.innerHTML=products.map(p=>`<div class="carousel-card" onclick="window.hlOpenProduct('${p.code}')"><div class="carousel-img" style="${p.image?`background-image:url('${p.image.replace(/'/g,'')}')`:''}">${p.image?'':'sem foto'}</div><div class="carousel-body"><div class="carousel-name">${escapeHtml(p.name)}</div><div class="carousel-count">${fmtMoney(p.publicPrice!=null?p.publicPrice:p.price)}</div></div></div>`).join('');
  }

  function renderTopSellers(wrapId, listId, mode){
    const sold = {};
    ACERTOS.forEach(a=>{ sold[a.productCode] = (sold[a.productCode]||0) + Number(a.qty); });
    const rankedAll = Object.entries(sold).sort((a,b)=>b[1]-a[1])
      .map(([code, qty])=>({ p: PRODUCTS.find(p=>p.code===code), qty })).filter(r=>r.p&&(mode==='consignado'?isConsignmentAvailable(r.p)&&r.p.active!==false:isPubliclySellable(r.p)));
    const top10 = rankedAll.slice(0,10);

    const wrap = document.getElementById(wrapId);
    if(!wrap) return;
    if(top10.length === 0){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    document.getElementById(listId).innerHTML = top10.map((r,i)=>carouselCardHtml(r, i+1, i<3, mode)).join('');
    return top10.slice(0,5).map(r=>r.p.code);
  }

  function normalizeSearch(s){
    return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  function normalizeProductName(value){
    const clean=String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('pt-BR');
    return clean?clean.charAt(0).toLocaleUpperCase('pt-BR')+clean.slice(1):'';
  }
  function matchesSearch(p, query){
    if(!query) return true;
    const q = normalizeSearch(query);
    const haystack = normalizeSearch([p.name, p.code, ...getCategories(p)].join(' '));
    return haystack.includes(q);
  }

  function buildCardPriceHtml(p, selectedColorName){
    const colors = p.colors || [];
    const displayPrice = getPublicPrice(p,selectedColorName);
    const info = selectedColorName ? getPromoInfo(p, selectedColorName) : getPromoInfo(p);
    const soldOut=getTotalStock(p)===0;
    const buyBtn = `<button type="button" class="btn buy-btn" ${soldOut?'disabled aria-disabled="true"':''} onclick="event.stopPropagation();${soldOut?'':'window.hlOpenProduct(\''+p.code+'\')'}">${soldOut?'Esgotado':'Comprar'}</button>`;
    if(info){
      return `<div class="card-footer">
             <div class="portfolio-list-price promo-price-block">
               <span class="promo-pct-badge">🔥 -${info.pct}%</span>
               <span class="promo-old-price">${fmtMoney(info.base)}</span>
               <span class="promo-new-price">${fmtMoney(info.promo)}</span>
             </div>
             ${buyBtn}
           </div>`;
    }
    const colorOnlyPromoObj = !selectedColorName ? colors.find(c=>getPromoInfo(p, c.name)) : null;
    return `<div class="card-footer">
             <div class="price">${fmtMoney(displayPrice)}</div>
             ${colorOnlyPromoObj ? `<div class="promo-pct-badge" style="margin-bottom:2px;">🔥 promoção na cor ${colorOnlyPromoObj.name}</div>` : ''}
             ${buyBtn}
           </div>`;
  }

  function getTotalStock(p){
    if(p.onDemand) return null; // sob encomenda não tem limite real de estoque
    const colors = p.colors || [];
    if(colors.length === 0) return null; // produto sem controle de cor/estoque
    return colors.reduce((s,c)=>s + (Number(c.stock)||0), 0);
  }

  function sortProducts(list, order){
    const arr = [...list];
    switch(order){
      case 'menor-preco':
        return arr.sort((a,b)=>(a.publicPrice!=null?a.publicPrice:a.price) - (b.publicPrice!=null?b.publicPrice:b.price));
      case 'maior-preco':
        return arr.sort((a,b)=>(b.publicPrice!=null?b.publicPrice:b.price) - (a.publicPrice!=null?a.publicPrice:a.price));
      case 'recentes':
        return arr.sort((a,b)=>(b.createdAt||0) - (a.createdAt||0));
      default:
        return arr;
    }
  }

  function renderPortfolio(){
    const grid = document.getElementById('portfolio-grid');
    const loading = document.getElementById('portfolio-loading');
    const empty = document.getElementById('portfolio-empty');
    loading.style.display = 'none';
    const active = PRODUCTS.filter(isPubliclySellable);
    renderPortfolioFilters(active);
    const reset = document.getElementById('catalog-reset-btn');
    if(reset){
      const hasFilters = portfolioSearchQuery || currentCategoryFilter !== 'Todos' || portfolioSortOrder !== 'relevancia';
      reset.style.display = hasFilters ? 'inline-flex' : 'none';
    }
    renderPromoCarousel('promo-wrap','promo-carousel');
    renderNewArrivalsCarousel('new-wrap','new-carousel');
    renderRecentlyViewed();
    const topCodes = renderTopSellers('top-sellers-wrap','top-sellers') || [];
    const shown = currentCategoryFilter==='Todos' ? active : active.filter(p=>getCategories(p).includes(currentCategoryFilter));
    const searched = shown.filter(p=>matchesSearch(p, portfolioSearchQuery));
    const resultCount=document.getElementById('portfolio-result-count');
    if(resultCount)resultCount.textContent=`${searched.length} produto${searched.length===1?'':'s'} encontrado${searched.length===1?'':'s'}${currentCategoryFilter!=='Todos'?' em '+currentCategoryFilter:''}.`;
    if(searched.length === 0){
      empty.style.display='block'; grid.style.display='none';
      empty.innerHTML = portfolioSearchQuery
        ? `<div class="glyph">◇</div>Nenhum produto encontrado para “${escapeHtml(portfolioSearchQuery)}”.`
        : `<div class="glyph">◇</div>Nenhum produto nesta categoria ainda.`;
      return;
    }
    empty.style.display='none'; grid.style.display='grid';
    // no filtro "Todos" sem busca ativa, os mais vendidos já aparecem em destaque acima, então não repete na grade
    const gridItemsRaw = (currentCategoryFilter==='Todos' && !portfolioSearchQuery) ? searched.filter(p=>!topCodes.includes(p.code)) : searched;
    // promoções sempre na frente da listagem, independente da ordenação escolhida
    const gridItems = sortProducts(gridItemsRaw, portfolioSortOrder)
      .sort((a,b) => (hasAnyPromo(b)?1:0) - (hasAnyPromo(a)?1:0));

    grid.innerHTML = gridItems.map(p=>{
      const colors = p.colors || [];
      const colorsHtml = colors.length ? `<div class="delivery-hint" style="margin-top:8px;">Escolha uma cor:</div><div class="portfolio-colors">${colors.map(c=>`
        <button type="button" class="color-pill ${Number(c.stock)<=0?'out':''}" onclick="event.stopPropagation();window.hlSwapImage('${p.code}',decodeURIComponent('${encodeURIComponent(c.name).replace(/'/g,'%27')}'), this)">${escapeHtml(c.name)}${c.publicPrice!=null&&Number(c.publicPrice)>0?' · '+fmtMoney(c.publicPrice):''}${Number(c.stock)<=0?' • esgotado':''}</button>`).join('')}</div>` : '';
      const promoInfo = getPromoInfo(p);
      const promoColor = !promoInfo ? colors.find(c=>getPromoInfo(p, c.name)) : null;
      const colorOnlyPromo = !!promoColor;
      const cardImage = (promoColor && promoColor.image) ? promoColor.image : p.image;
      const totalStock = getTotalStock(p);
      const lowStockHtml = (totalStock !== null && totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD)
        ? `<div class="low-stock-badge">⚡ Só ${totalStock} ${totalStock===1?'unidade':'unidades'}!</div>` : '';
      const soldOutHtml = totalStock===0 ? '<div class="sold-out-badge">Esgotado</div>' : '';
      return `
      <div class="card big-photo ${(promoInfo || colorOnlyPromo) ? 'on-sale' : ''}" role="button" tabindex="0" data-open-product="${escapeHtml(p.code)}" aria-label="Ver ${escapeHtml(p.name)}" onclick="window.hlOpenProduct('${p.code}')">
        <div class="img" id="card-img-${p.code}" style="${cardImage ? `background-image:url('${cardImage.replace(/'/g,"")}')` : ''}">${cardImage ? '' : 'sem foto'}${p.video ? '<span class="video-badge" style="position:absolute;bottom:8px;right:8px;">▶ vídeo</span>' : ''}${lowStockHtml}${soldOutHtml}</div>
        <div class="body">
          ${tagsHtml(p)}
          ${p.onDemand ? '<span class="badge acerto" style="margin-left:4px;">Sob encomenda</span>' : ''}
          ${p.customizable ? `<span class="badge customizavel" style="margin-left:4px;">✨ Personalizável${p.customizableMinQty ? ' (mín. '+p.customizableMinQty+')' : ''}</span>` : ''}
          <h3 id="card-name-${p.code}">${escapeHtml(p.name)}</h3>
          <div class="delivery-hint">${p.onDemand?'Produção sob encomenda · prazo a combinar':totalStock===null?'Consulte disponibilidade':'Pronta entrega'}</div>
          ${colorsHtml}
          <div id="price-block-${p.code}">${buildCardPriceHtml(p, null)}</div>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('portfolio-sort').addEventListener('change', (e)=>{
    portfolioSortOrder = e.target.value;
    saveCatalogState();
    document.getElementById('portfolio-search').value=portfolioSearchQuery;
    document.getElementById('portfolio-sort').value=portfolioSortOrder;
    renderPortfolio();
  });

  document.getElementById('portfolio-search').addEventListener('input', (e)=>{
    portfolioSearchQuery = e.target.value.trim();
    saveCatalogState();
    renderPortfolio();
  });

  document.getElementById('catalog-reset-btn').addEventListener('click', ()=>{
    currentCategoryFilter = 'Todos';
    portfolioSearchQuery = '';
    portfolioSortOrder = 'relevancia';
    document.getElementById('portfolio-search').value = '';
    document.getElementById('portfolio-sort').value = 'relevancia';
    saveCatalogState();
    renderPortfolio();
    document.getElementById('catalog-start').scrollIntoView({behavior:'smooth', block:'start'});
  });

  window.hlSwapImage = function(code, colorName, btnEl){
    const p = PRODUCTS.find(p=>p.code===code);
    if(!p) return;
    const c = (p.colors||[]).find(c=>c.name===colorName);
    const img = (c && c.image) ? c.image : p.image;
    const el = document.getElementById('card-img-'+code);
    if(el){
      const videoBadge = p.video ? '<span class="video-badge">▶ vídeo</span>' : '';
      if(img){
        el.style.backgroundImage = `url('${img.replace(/'/g,"")}')`;
        el.innerHTML = videoBadge;
      } else {
        el.style.backgroundImage = '';
        el.innerHTML = 'sem imagem' + videoBadge;
      }
    }
    const priceBlock = document.getElementById('price-block-'+code);
    if(priceBlock) priceBlock.innerHTML = buildCardPriceHtml(p, colorName);
    // destaca visualmente qual cor está selecionada (pill ativo + nome do produto em tom diferente)
    if(btnEl){
      btnEl.parentElement.querySelectorAll('.color-pill').forEach(b=>b.classList.remove('selected'));
      btnEl.classList.add('selected');
    }
    const nameEl = document.getElementById('card-name-'+code);
    if(nameEl) nameEl.classList.add('color-selected-active');
    modalSelectedColor = colorName;
  };

  // ---------- MODAL DE PRÉ-VISUALIZAÇÃO ----------
  let carouselItems = [];
  let carouselIndex = 0;
  let productModalTrigger = null;

  function renderCarousel(){
    const track = document.getElementById('modal-carousel-track');
    const dotsWrap = document.getElementById('modal-carousel-dots');
    const prevBtn = document.getElementById('modal-carousel-prev');
    const nextBtn = document.getElementById('modal-carousel-next');

    track.innerHTML = carouselItems.map(item=>{
      if(item.type === 'video'){
        return `<div class="carousel-slide" data-type="video">
          <video src="${item.url}" ${item.muted!==false?'muted loop autoplay':'controls preload="metadata"'} playsinline></video>
          ${item.muted!==false?'<div class="play-overlay" onclick="window.hlOpenLightbox()"><div class="play-circle">▶</div></div>':''}
        </div>`;
      }
      if(item.type === 'gif'){
        return `<div class="carousel-slide" data-type="gif">
          <img src="${item.url}" alt="Imagem do produto">
          <div class="play-overlay" onclick="window.hlOpenLightbox()"><div class="play-circle">▶</div></div>
        </div>`;
      }
      if(item.type === 'image'){
        return `<div class="carousel-slide">
          <img src="${item.url}" alt="Animação do produto">
          <button type="button" class="zoom-btn" onclick="window.hlOpenLightbox()" title="Ampliar foto">🔍</button>
        </div>`;
      }
      return `<div class="carousel-slide"><span class="slide-placeholder">sem imagem</span></div>`;
    }).join('');

    dotsWrap.innerHTML = carouselItems.length > 1
      ? carouselItems.map((_,i)=>`<div class="carousel-dot ${i===carouselIndex?'active':''}" data-idx="${i}"></div>`).join('')
      : '';
    dotsWrap.querySelectorAll('.carousel-dot').forEach(dot=>{
      dot.addEventListener('click', ()=>{ carouselIndex = Number(dot.dataset.idx); updateCarouselPosition(); });
    });

    const showArrows = carouselItems.length > 1;
    prevBtn.classList.toggle('hidden', !showArrows);
    nextBtn.classList.toggle('hidden', !showArrows);

    updateCarouselPosition();
  }

  function updateCarouselPosition(){
    const track = document.getElementById('modal-carousel-track');
    track.style.transform = `translateX(-${carouselIndex * 100}%)`;
    document.querySelectorAll('#modal-carousel-dots .carousel-dot').forEach((dot,i)=>{
      dot.classList.toggle('active', i === carouselIndex);
    });
    // pausa vídeos que não estão visíveis, garante que o visível esteja tocando
    document.querySelectorAll('#modal-carousel-track video').forEach((v,i)=>{
      if(i === carouselIndex&&v.muted){ v.play().catch(()=>{}); } else { v.pause(); }
    });
    // se a foto atual for de uma cor específica, seleciona essa cor automaticamente no formulário de pedido
    const currentItem = carouselItems[carouselIndex];
    if(currentItem && currentItem.colorName){
      const colorField = document.getElementById('modal-buyer-color-field');
      const colorSelect = document.getElementById('modal-buyer-color');
      if(colorField.style.display !== 'none' && colorSelect.value !== currentItem.colorName){
        const optionExists = [...colorSelect.options].some(o=>o.value === currentItem.colorName);
        if(optionExists){
          colorSelect.value = currentItem.colorName;
          const code = document.getElementById('modal-buy-btn').dataset.productCode;
          if(code) updateModalPriceDisplay(code);
        }
      }
    }
  }

  document.getElementById('modal-carousel-prev').addEventListener('click', ()=>{
    carouselIndex = (carouselIndex - 1 + carouselItems.length) % carouselItems.length;
    updateCarouselPosition();
  });
  document.getElementById('modal-carousel-next').addEventListener('click', ()=>{
    carouselIndex = (carouselIndex + 1) % carouselItems.length;
    updateCarouselPosition();
  });

  // suporte a arrastar (swipe) no celular
  (function(){
    const track = document.getElementById('modal-carousel-track');
    let startX = 0, isDragging = false;
    track.addEventListener('touchstart', (e)=>{
      startX = e.touches[0].clientX;
      isDragging = true;
    }, { passive: true });
    track.addEventListener('touchend', (e)=>{
      if(!isDragging) return;
      isDragging = false;
      const deltaX = e.changedTouches[0].clientX - startX;
      if(Math.abs(deltaX) < 40 || carouselItems.length <= 1) return;
      if(deltaX < 0){ carouselIndex = (carouselIndex + 1) % carouselItems.length; }
      else { carouselIndex = (carouselIndex - 1 + carouselItems.length) % carouselItems.length; }
      updateCarouselPosition();
    }, { passive: true });
  })();

  window.hlOpenLightbox = function(){
    renderLightboxContent();
    const lightbox=document.getElementById('video-lightbox');lightbox.classList.add('open');lightbox.setAttribute('aria-hidden','false');
    document.getElementById('lightbox-close-btn').focus();
  };
  function renderLightboxContent(){
    const item = carouselItems[carouselIndex];
    if(!item) return;
    const lbVideo = document.getElementById('lightbox-video');
    const lbGif = document.getElementById('lightbox-gif');
    const lbImage = document.getElementById('lightbox-image');
    lbVideo.style.display = 'none'; lbVideo.pause(); lbVideo.removeAttribute('src');
    lbGif.style.display = 'none'; lbGif.removeAttribute('src');
    lbImage.style.display = 'none'; lbImage.removeAttribute('src');
    if(item.type === 'video'){
      lbVideo.src = item.url;
      lbVideo.muted = item.muted !== false;
      lbVideo.style.display = 'block';
      lbVideo.play().catch(()=>{});
    } else if(item.type === 'gif'){
      lbGif.src = item.url;
      lbGif.style.display = 'block';
    } else if(item.type === 'image'){
      lbImage.src = item.url;
      lbImage.style.display = 'block';
    }
    const showArrows = carouselItems.length > 1;
    document.getElementById('lightbox-prev').classList.toggle('hidden', !showArrows);
    document.getElementById('lightbox-next').classList.toggle('hidden', !showArrows);
  }
  document.getElementById('lightbox-prev').addEventListener('click', (e)=>{
    e.stopPropagation();
    carouselIndex = (carouselIndex - 1 + carouselItems.length) % carouselItems.length;
    updateCarouselPosition();
    renderLightboxContent();
  });
  document.getElementById('lightbox-next').addEventListener('click', (e)=>{
    e.stopPropagation();
    carouselIndex = (carouselIndex + 1) % carouselItems.length;
    updateCarouselPosition();
    renderLightboxContent();
  });
  document.getElementById('lightbox-image').addEventListener('click', (e)=>{
    e.stopPropagation();
    e.target.classList.toggle('zoomed');
  });
  function closeLightbox(){
    const lightbox=document.getElementById('video-lightbox');lightbox.classList.remove('open');lightbox.setAttribute('aria-hidden','true');
    const lbVideo = document.getElementById('lightbox-video');
    lbVideo.pause();
    document.getElementById('lightbox-image').classList.remove('zoomed');
  }
  document.getElementById('lightbox-close-btn').addEventListener('click', closeLightbox);
  document.getElementById('video-lightbox').addEventListener('click', (e)=>{
    if(e.target.id === 'video-lightbox') closeLightbox();
  });

  function openProductModal(code){
    const p = PRODUCTS.find(p=>p.code===code);
    if(!p) return;
    if(currentClientCode&&currentPartnerToken)logPartnerActivity('product_view','catalogo',0,{productCode:code});
    try{sessionStorage.setItem(CATALOG_SCROLL_KEY,String(window.scrollY));}catch(e){}
    rememberRecentProduct(code);
    renderRecentlyViewed();
    const modal=document.getElementById('product-modal'),wasOpen=modal.classList.contains('open');
    if(!wasOpen)productModalTrigger=document.activeElement;

    // monta a lista de mídias: vídeo/gif primeiro (mostra o movimento), depois foto de capa, fotos de cada cor, e por fim a galeria
    carouselItems = [];
    if(p.video){
      const isGif = /\.gif($|\?)/i.test(p.video);
      carouselItems.push({ type: isGif ? 'gif' : 'video', url: p.video, muted: p.videoMuted !== false });
    }
    const seenUrls = new Set();
    const defaultColorName = (p.colors && p.colors.length) ? p.colors[0].name : null;
    const pushPhoto = (url, colorName) => {
      if(!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      carouselItems.push({ type:'image', url, colorName: colorName || defaultColorName });
    };
    pushPhoto(p.image, defaultColorName);
    (p.colors || []).forEach(c => pushPhoto(c.image, c.name));
    (p.gallery || []).forEach(url => pushPhoto(url, defaultColorName));
    if(carouselItems.length === 0) carouselItems.push({ type:'empty' });
    carouselIndex = 0;
    renderCarousel();

    document.getElementById('modal-tags').innerHTML = tagsHtml(p);
    document.getElementById('modal-name').textContent = p.name;
    document.getElementById('modal-code').textContent = p.code;
    const descEl = document.getElementById('modal-description');
    if(p.description){ descEl.textContent = p.description; descEl.style.display = 'block'; }
    else { descEl.style.display = 'none'; }
    document.getElementById('modal-consignado-wrap').style.display = 'none';

    // formulário de pedido
    const colors = p.colors || [];
    const colorField = document.getElementById('modal-buyer-color-field');
    const colorSelect = document.getElementById('modal-buyer-color');
    if(colors.length){
      colorField.style.display = 'block';
      colorSelect.innerHTML = colors.map(c=>`<option value="${escapeHtml(c.name)}" ${c.name===modalSelectedColor?'selected':''} ${!p.onDemand&&Number(c.stock)<=0?'disabled':''}>${escapeHtml(c.name)} · ${fmtMoney(getPublicPrice(p,c.name))}${getPromoInfo(p, c.name) ? ' 🔥' : ''}${!p.onDemand&&Number(c.stock)<=0?' — esgotado':''}</option>`).join('');
    } else {
      colorField.style.display = 'none';
      colorSelect.innerHTML = '';
    }
    document.getElementById('modal-buyer-qty').value = 1;
    document.getElementById('modal-buy-msg').innerHTML = '';
    document.getElementById('modal-buy-btn').dataset.productCode = p.code;
    document.getElementById('modal-buy-btn').style.display = 'block';
    document.getElementById('modal-post-add').style.display = 'none';
    modalSelectedColor = null;

    updateModalPriceDisplay(p.code);
    renderRelatedProducts(p);
    const productHash='#p='+encodeURIComponent(p.code);
    if(wasOpen)history.replaceState({hlProduct:true},'',productHash);
    else if(location.hash!==productHash)history.pushState({hlProduct:true},'',productHash);
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    setTimeout(()=>document.getElementById('modal-close-btn').focus(),0);
  }

  function renderRelatedProducts(p){
    const wrap = document.getElementById('modal-related-wrap');
    const cats = getCategories(p);
    const related = PRODUCTS
      .filter(o => o.code !== p.code && o.active !== false && getCategories(o).some(c=>cats.includes(c)))
      .slice(0, 6);
    if(related.length === 0){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    document.getElementById('modal-related').innerHTML = related.map(o=>{
      const displayPrice = o.publicPrice != null ? o.publicPrice : o.price;
      return `
      <div class="carousel-card" onclick="window.hlOpenProduct('${o.code}')">
        <div class="carousel-img" style="${o.image ? `background-image:url('${o.image.replace(/'/g,"")}')` : ''}">${o.image ? '' : 'sem foto'}</div>
        <div class="carousel-body">
          <div class="carousel-name">${o.name}</div>
          <div class="carousel-count">${fmtMoney(displayPrice)}</div>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('modal-copy-link-btn').addEventListener('click', async ()=>{
    const btn = document.getElementById('modal-copy-link-btn');
    const code=document.getElementById('modal-buy-btn').dataset.productCode;
    const product=PRODUCTS.find(p=>p.code===code);
    const url=`${location.origin}${location.pathname}#p=${encodeURIComponent(code||'')}`;
    try{
      if(navigator.share){
        await navigator.share({title:product?.name||'Produto Heitor Labs',text:product?`Confira ${product.name} no catálogo da Heitor Labs.`:'Confira este produto no catálogo da Heitor Labs.',url});
        return;
      }
      await navigator.clipboard.writeText(url);
      const original = btn.textContent;
      btn.textContent = '✓ Link copiado!';
      setTimeout(()=>{ btn.textContent = original; }, 1800);
    }catch(e){
      if(e?.name==='AbortError')return;
      alert('Não consegui copiar automaticamente. Copie manualmente pela barra de endereço.');
    }
  });

  function updateModalPriceDisplay(code){
    const p = PRODUCTS.find(p=>p.code===code);
    if(!p) return;
    const colorField = document.getElementById('modal-buyer-color-field');
    const activeColor = colorField.style.display !== 'none' ? document.getElementById('modal-buyer-color').value : null;
    const availability=document.getElementById('modal-availability-info');
    const availabilityParts=[];
    if(p.onDemand)availabilityParts.push('Produzido sob encomenda · confirme o prazo pelo WhatsApp.');
    else if(getTotalStock(p)===null)availabilityParts.push('Disponibilidade e prazo confirmados no atendimento.');
    else availabilityParts.push('Produto disponível para pronta entrega, conforme o estoque da cor escolhida.');
    if(p.customizable)availabilityParts.push(`Personalização disponível${p.customizableMinQty?' a partir de '+p.customizableMinQty+' unidades':''}.`);
    availability.textContent=availabilityParts.join(' ');
    document.getElementById('modal-public-price').textContent = fmtMoney(getPublicPrice(p,activeColor));
    const promoInfoModal = getPromoInfo(p, activeColor);
    if(promoInfoModal){
      document.getElementById('modal-price-normal-wrap').style.display = 'none';
      document.getElementById('modal-promo-wrap').style.display = 'block';
      document.getElementById('modal-promo-badge').textContent = `🔥 -${promoInfoModal.pct}%${activeColor ? ' nesta cor' : ''}`;
      document.getElementById('modal-promo-old').textContent = fmtMoney(promoInfoModal.base);
      document.getElementById('modal-promo-new').textContent = fmtMoney(promoInfoModal.promo);
    } else {
      document.getElementById('modal-price-normal-wrap').style.display = 'block';
      document.getElementById('modal-promo-wrap').style.display = 'none';
    }
    // aviso de urgência de estoque — não se aplica a itens sob encomenda (não têm limite real)
    const lowStockEl = document.getElementById('modal-low-stock');
    if(p.onDemand){
      lowStockEl.style.display = 'none';
    } else {
      let stockToShow = null;
      if(activeColor){
        const c = (p.colors||[]).find(c=>c.name===activeColor);
        if(c) stockToShow = Number(c.stock)||0;
      } else {
        stockToShow = getTotalStock(p);
      }
      if(stockToShow !== null && stockToShow > 0 && stockToShow <= LOW_STOCK_THRESHOLD){
        lowStockEl.style.display = 'block';
        lowStockEl.innerHTML = `<span class="promo-pct-badge" style="background:linear-gradient(90deg,#C23349,#C85A28);">⚡ Só ${stockToShow} ${stockToShow===1?'unidade':'unidades'} ${activeColor ? 'nesta cor' : ''}!</span>`;
      } else if(stockToShow === 0){
        lowStockEl.style.display = 'block';
        lowStockEl.innerHTML = `<span class="promo-pct-badge" style="background:var(--muted);">Esgotado ${activeColor ? 'nesta cor' : ''}</span>`;
      } else {
        lowStockEl.style.display = 'none';
      }
    }
    const buyButton=document.getElementById('modal-buy-btn'),soldOut=availablePublicStock(p,activeColor)===0;
    buyButton.disabled=soldOut;buyButton.textContent=soldOut?'Esgotado':'+ Adicionar ao carrinho';
  }
  document.getElementById('modal-buyer-color').addEventListener('change', ()=>{
    const code = document.getElementById('modal-buy-btn').dataset.productCode;
    if(code) updateModalPriceDisplay(code);
  });
  function closeProductModal(updateHistory=true){
    const modal=document.getElementById('product-modal');modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';
    document.querySelectorAll('#modal-carousel-track video').forEach(v=>v.pause());
    closeLightbox();
    if(updateHistory&&history.state?.hlProduct)history.back();
    else if(updateHistory&&location.hash.startsWith('#p='))history.replaceState(null,'',location.pathname+location.search);
    if(productModalTrigger&&typeof productModalTrigger.focus==='function')productModalTrigger.focus();productModalTrigger=null;
  }
  window.hlOpenProduct = openProductModal;
  document.getElementById('modal-close-btn').addEventListener('click', closeProductModal);
  document.getElementById('product-modal').addEventListener('click', (e)=>{
    if(e.target.id === 'product-modal') closeProductModal();
  });
  window.addEventListener('popstate',()=>{if(document.getElementById('product-modal').classList.contains('open'))closeProductModal(false);});
  root.addEventListener('keydown',e=>{
    const openModal=document.getElementById('product-modal');
    if(e.key==='Tab'&&openModal.classList.contains('open')){
      const focusable=[...openModal.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
      if(focusable.length){const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    }
    const card=e.target.closest('[data-open-product]');
    if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openProductModal(card.dataset.openProduct);return;}
    if(e.key==='Escape'){
      if(document.getElementById('video-lightbox').classList.contains('open'))closeLightbox();
      else if(document.getElementById('product-modal').classList.contains('open'))closeProductModal();
    }
  });

  // ---------- CARRINHO DE COMPRAS (público em geral) ----------
  // ---------- persistência de carrinho (sobrevive a recarregar a página) ----------
  function saveCartStorage(key, cart){
    try{ localStorage.setItem(key, JSON.stringify(cart)); }catch(e){}
  }
  function loadCartStorage(key){
    try{
      const raw = localStorage.getItem(key);
      const parsed=raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)?parsed.filter(item=>item&&item.productCode&&Number(item.qty)>0).map(item=>({...item,qty:Math.max(1,Math.floor(Number(item.qty)))})):[];
    }catch(e){ return []; }
  }

  let publicCart = loadCartStorage('hl_public_cart');

  function availablePublicStock(product,color){
    if(!product||product.onDemand)return Infinity;
    const colors=product.colors||[];
    if(!colors.length)return Number.isFinite(Number(product.stock))?Math.max(0,Number(product.stock)):Infinity;
    if(color){const selected=colors.find(item=>item.name===color);return selected?Math.max(0,Number(selected.stock)||0):0;}
    return Math.max(0,getTotalStock(product)||0);
  }

  document.getElementById('modal-buy-btn').addEventListener('click', ()=>{
    const msgEl = document.getElementById('modal-buy-msg');
    const code = document.getElementById('modal-buy-btn').dataset.productCode;
    const p = PRODUCTS.find(p=>p.code===code);
    if(!p) return;
    const qty = Math.floor(Number(document.getElementById('modal-buyer-qty').value));
    const colorField = document.getElementById('modal-buyer-color-field');
    const color = colorField.style.display !== 'none' ? document.getElementById('modal-buyer-color').value : '';
    if(!Number.isFinite(qty)||qty<1){msgEl.innerHTML='<div class="msg err">Informe uma quantidade válida, a partir de 1.</div>';return;}

    const existing = publicCart.find(i=>i.productCode===code && i.color===color);
    const available=availablePublicStock(p,color),requested=(existing?.qty||0)+qty;
    if(requested>available){msgEl.innerHTML=`<div class="msg err">Estoque disponível: ${available} unidade${available===1?'':'s'}${color?' na cor '+escapeHtml(color):''}.</div>`;return;}
    if(existing){ existing.qty += qty; }
    else { publicCart.push({ productCode: code, color, qty }); }
    renderPublicCart();

    msgEl.innerHTML = '';
    document.getElementById('modal-buy-btn').style.display = 'none';
    document.getElementById('modal-post-add').style.display = 'block';
  });
  document.getElementById('modal-keep-browsing-btn').addEventListener('click', ()=>{
    closeProductModal();
  });
  document.getElementById('modal-finish-order-btn').addEventListener('click', ()=>{
    closeProductModal();
    document.getElementById('public-cart-panel').scrollIntoView({ behavior:'smooth', block:'start' });
    setTimeout(()=>{ const n = document.getElementById('public-cart-name'); if(n) n.focus(); }, 400);
  });

  function renderPublicCart(){
    publicCart=publicCart.filter(item=>{
      const product=PRODUCTS.find(p=>p.code===item.productCode);
      return product&&product.active!==false&&Number(item.qty)>0;
    });
    saveCartStorage('hl_public_cart', publicCart);
    const totalQty = publicCart.reduce((s,i)=>s+i.qty,0);

    const fab = document.getElementById('mobile-public-cart-fab');
    if(fab){
      if(totalQty > 0){
        fab.classList.add('show');
        document.getElementById('public-mobile-cart-fab-badge').textContent = totalQty;
      } else {
        fab.classList.remove('show');
      }
    }

    const panel = document.getElementById('public-cart-panel');
    const itemsWrap = document.getElementById('public-cart-items');
    const checkoutFields = document.getElementById('public-cart-checkout-fields');
    const actions = document.getElementById('public-cart-actions');
    const badge = document.getElementById('public-cart-count-badge');
    if(!panel) return;

    if(publicCart.length === 0){
      panel.style.display = 'none';actions.style.display='none';
      return;
    }
    panel.style.display = 'block';
    badge.style.display = 'inline-block';
    badge.textContent = totalQty;
    checkoutFields.style.display = 'flex';
    actions.style.display = 'flex';

    itemsWrap.innerHTML = publicCart.map((item, idx)=>{
      const p = PRODUCTS.find(p=>p.code===item.productCode);
      const name = p ? p.name : item.productCode;
      const promoInfoItem = p ? getPromoInfo(p, item.color) : null;
      const price = promoInfoItem ? promoInfoItem.promo : (p ? getPublicPrice(p,item.color) : 0);
      const priceLabel = promoInfoItem ? `🔥 ${fmtMoney(price)} cada (era ${fmtMoney(promoInfoItem.base)})` : `${fmtMoney(price)} cada`;
      return `
      <div class="ticket" style="margin-bottom:8px;">
        <div class="left">
          <div class="desc">${name}${item.color ? ' — '+item.color : ''}</div>
          <div class="id">${priceLabel}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button data-pcart-dec="${idx}" class="cart-qty-btn">−</button>
          <span class="mono" style="min-width:20px;text-align:center;">${item.qty}</span>
          <button data-pcart-inc="${idx}" class="cart-qty-btn">+</button>
          <button data-pcart-remove="${idx}" class="cart-qty-btn" title="Remover">✕</button>
        </div>
      </div>`;
    }).join('');

    itemsWrap.querySelectorAll('[data-pcart-inc]').forEach(b=>b.addEventListener('click', ()=>{
      const item=publicCart[+b.dataset.pcartInc],product=PRODUCTS.find(p=>p.code===item.productCode),available=availablePublicStock(product,item.color);
      if(item.qty>=available){document.getElementById('public-cart-msg').innerHTML=`<div class="msg err">Estoque máximo disponível: ${available} unidade${available===1?'':'s'}.</div>`;return;}
      item.qty += 1;document.getElementById('public-cart-msg').innerHTML='';renderPublicCart();
    }));
    itemsWrap.querySelectorAll('[data-pcart-dec]').forEach(b=>b.addEventListener('click', ()=>{
      const idx = +b.dataset.pcartDec;
      publicCart[idx].qty -= 1;
      if(publicCart[idx].qty <= 0) publicCart.splice(idx,1);
      renderPublicCart();
    }));
    itemsWrap.querySelectorAll('[data-pcart-remove]').forEach(b=>b.addEventListener('click', ()=>{
      publicCart.splice(+b.dataset.pcartRemove,1); renderPublicCart();
    }));

    renderPublicCartTotal();
  }

  function renderPublicCartTotal(){
    const summaryEl = document.getElementById('public-cart-total-summary');
    if(!summaryEl || publicCart.length === 0){ if(summaryEl) summaryEl.style.display = 'none'; return; }
    let subtotal = 0;
    publicCart.forEach(item=>{
      const p = PRODUCTS.find(p=>p.code===item.productCode);
      if(!p) return;
      const promoInfoItem = getPromoInfo(p, item.color);
      const price = promoInfoItem ? promoInfoItem.promo : getPublicPrice(p,item.color);
      subtotal += price * item.qty;
    });
    const city = document.getElementById('public-cart-city').value;
    const frete = city === 'uberaba' ? 5 : null;
    const total = subtotal + (frete || 0);
    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
      <div class="cart-total-box">
        <div class="cart-total-row"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
        <div class="cart-total-row"><span>Frete</span><span>${frete != null ? fmtMoney(frete) : 'a combinar'}</span></div>
        <div class="cart-total-row grand"><span>Total</span><span>${frete != null ? fmtMoney(total) : fmtMoney(subtotal) + ' + frete'}</span></div>
      </div>`;
  }
  document.getElementById('public-cart-city').addEventListener('change', renderPublicCartTotal);

  document.getElementById('public-cart-submit-btn').addEventListener('click', ()=>{
    const msgEl = document.getElementById('public-cart-msg');
    const buyerName = document.getElementById('public-cart-name').value.trim();
    const city = document.getElementById('public-cart-city').value;
    if(!buyerName){ msgEl.innerHTML = '<div class="msg err">Preencha seu nome antes de enviar.</div>'; return; }
    if(publicCart.length === 0) return;
    const unavailable=publicCart.find(item=>{const product=PRODUCTS.find(p=>p.code===item.productCode);return !product||product.active===false||item.qty>availablePublicStock(product,item.color);});
    if(unavailable){msgEl.innerHTML='<div class="msg err">Um dos produtos não possui mais a quantidade solicitada. Revise o carrinho antes de continuar.</div>';renderPublicCart();return;}

    let text = `Olá! Meu nome é ${buyerName} e tenho interesse em fazer um pedido:\n\n`;
    publicCart.forEach(item=>{
      const p = PRODUCTS.find(p=>p.code===item.productCode);
      const name = p ? p.name : item.productCode;
      const promoInfoMsg = p ? getPromoInfo(p, item.color) : null;
      const price = promoInfoMsg ? promoInfoMsg.promo : (p ? getPublicPrice(p,item.color) : 0);
      const promoTag = promoInfoMsg ? ' [PROMOÇÃO]' : '';
      text += `• ${item.qty}x ${name}${item.color ? ' ('+item.color+')' : ''} — ${fmtMoney(price)} cada${promoTag}\n`;
    });
    if(city === 'uberaba'){
      text += `\nCidade: Uberaba - MG\nFrete: R$ 5,00 (entrega na cidade)\n`;
    } else {
      text += `\nCidade: outra cidade (a combinar o frete)\n`;
    }
    text += `\nAguardo retorno, obrigado(a)!`;

    const link = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(link, '_blank', 'noopener');
    msgEl.innerHTML = '<div class="msg ok">Pedido preparado no WhatsApp. O carrinho foi mantido até você confirmar o envio.</div>';
  });
  document.getElementById('public-cart-clear-btn').addEventListener('click',()=>{
    if(!confirm('Limpar todos os produtos do carrinho?'))return;
    publicCart=[];document.getElementById('public-cart-msg').innerHTML='';document.getElementById('public-cart-name').value='';renderPublicCart();
  });

  // ---------- cálculo de saldo ----------
  function clientStats(code){
    const products = [];
    const productCodes=new Set(PRODUCTS.map(p=>p.code));
    [...ENTREGAS,...DEVOLUCOES,...ACERTOS].forEach(item=>{if(item.clientCode===code&&item.productCode)productCodes.add(item.productCode);});
    productCodes.forEach(productCode=>{
      const p=PRODUCTS.find(item=>item.code===productCode)||{code:productCode,name:'',price:0,publicPrice:0};
      const colorsUsed=new Set();
      [...ENTREGAS,...DEVOLUCOES,...ACERTOS].forEach(item=>{
        if(item.clientCode===code&&item.productCode===p.code)colorsUsed.add(item.color||'');
      });
      colorsUsed.forEach(color=>{
        const sameItem=item=>item.clientCode===code&&item.productCode===p.code&&(item.color||'')===color;
        const entregue=ENTREGAS.filter(sameItem).reduce((sum,item)=>sum+Number(item.qty),0);
        const devolvido=DEVOLUCOES.filter(sameItem).reduce((sum,item)=>sum+Number(item.qty),0);
        const acertosDoProduto=ACERTOS.filter(sameItem);
        const vendido=acertosDoProduto.reduce((sum,item)=>sum+Number(item.qty),0);
        const devido=acertosDoProduto.reduce((sum,item)=>sum+Number(item.qty)*movementUnitPrice(item),0);
        const pago=acertosDoProduto.filter(item=>item.status==='Pago').reduce((sum,item)=>sum+Number(item.qty)*movementUnitPrice(item),0);
        const saldo=Math.max(0,entregue-devolvido-vendido);
        const lucroEstimado=acertosDoProduto.reduce((sum,item)=>sum+Math.max(0,movementPublicPrice(item)-movementUnitPrice(item))*Number(item.qty),0);
        const related=[...acertosDoProduto,...ENTREGAS.filter(sameItem)],latest=related[related.length-1];
        const inventoryPrice=latest?movementUnitPrice(latest):Number(p.price||0),name=p.name||movementProductName(latest||{productCode:p.code});
        products.push({code:p.code,name,color,price:inventoryPrice,entregue,devolvido,vendido,saldo,devido,pago,pendente:devido-pago,lucroEstimado});
      });
    });
    products.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||(a.color||'').localeCompare(b.color||'','pt-BR'));
    const totals = products.reduce((acc,r)=>({
      saldo: acc.saldo+r.saldo, devido: acc.devido+r.devido, pago: acc.pago+r.pago, pendente: acc.pendente+r.pendente,
      valorEmEstoque: acc.valorEmEstoque + r.saldo*Number(r.price),
      lucroEstimado: acc.lucroEstimado + r.lucroEstimado
    }), {saldo:0,devido:0,pago:0,pendente:0,valorEmEstoque:0,lucroEstimado:0});
    return { products, totals };
  }

  function clientHistory(code){
    // agrupa entregas feitas juntas (mesma "leva") num único item, com os produtos dentro —
    // entregas antigas, lançadas antes dessa função existir, não têm batchId e viram um "grupo" de 1 item só
    const batches = {};
    ENTREGAS.filter(e=>e.clientCode===code).forEach(e=>{
      const key = e.batchId || ('single-'+e.id);
      if(!batches[key]) batches[key] = { date: e.date, items: [] };
      batches[key].items.push(e);
    });
    const entregaItems = Object.entries(batches).map(([key, batch])=>{
      const totalQty = batch.items.reduce((s,i)=>s+Number(i.qty),0);
      const totalValue = batch.items.reduce((s,i)=>s+Number(i.qty)*movementUnitPrice(i),0);
      const desc = batch.items.length > 1
        ? `Entrega — ${batch.items.length} itens (${totalQty} peças) — ${fmtMoney(totalValue)}`
        : `Entrega de ${batch.items[0].qty}x ${movementProductName(batch.items[0])}${movementColorName(batch.items[0]) ? ' ('+movementColorName(batch.items[0])+')' : ''}`;
      return { type:'entrega', date: batch.date, id: key, desc, items: batch.items, totalValue };
    });

    const items = [
      ...entregaItems,
      ...DEVOLUCOES.filter(d=>d.clientCode===code).map(d=>({type:'devolucao', date:d.date, id:d.id, desc:`Devolução de ${d.qty}x ${movementProductName(d)}${movementColorName(d) ? ' ('+movementColorName(d)+')' : ''}`})),
      ...ACERTOS.filter(a=>a.clientCode===code).map(a=>({type:'acerto', date:a.date, id:a.id, desc:`Acerto: ${a.qty}x ${movementProductName(a)}${movementColorName(a) ? ' ('+movementColorName(a)+')' : ''} — ${fmtMoney(a.qty*movementUnitPrice(a))}`, status:a.status})),
      ...VENDAS.filter(v=>v.clientCode===code).map(v=>({type:'venda', date:v.date, id:v.id, desc:`✅ Compra paga: ${v.qty}x ${movementProductName(v)}${movementColorName(v) ? ' ('+movementColorName(v)+')' : ''} — ${fmtMoney(v.total)}${v.obs ? ' · '+v.obs : ''}`})),
    ];
    return items.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  }

  function partnerAction(type,targetId){
    return PARTNER_ACTIONS.find(a=>a.type===type&&String(a.targetId||'')===String(targetId||''));
  }
  async function submitPartnerAction(type,payload={}){
    if(!currentPartnerToken)throw new Error('Sessão expirada. Entre novamente.');
    const {data,error}=await supabaseClient.rpc('partner_submit_action_secure',{p_access_token:currentPartnerToken,p_action_type:type,p_payload:payload});
    if(error)throw error;
    await loadPartnerSnapshot(currentClientCode);
    return typeof data==='string'?JSON.parse(data):data;
  }
  function deliveryBatches(code){
    const batches={};
    ENTREGAS.filter(e=>e.clientCode===code).forEach(e=>{
      const key=e.batchId||('single-'+e.id);
      if(!batches[key])batches[key]={id:key,date:e.date,items:[]};
      batches[key].items.push(e);
    });
    return Object.values(batches).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  }
  function renderPartnerCenter(code){
    const alerts=document.getElementById('partner-alerts');
    const batches=deliveryBatches(code),unconfirmed=batches.filter(b=>!partnerAction('delivery_confirmed',b.id));
    const pendingOrders=PEDIDOS.filter(p=>p.clientCode===code&&p.status==='Pendente');
    const reportedSales=PARTNER_ACTIONS.filter(a=>a.clientCode===code&&a.type==='sale_report'&&a.status==='Pendente');
    const unreadDocs=DOCUMENTS.filter(d=>d.clientCode===code&&!partnerAction('document_read',d.id));
    const pending=ACERTOS.filter(a=>a.clientCode===code&&a.status!=='Pago');
    const oldest=pending.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))[0];
    const deadlineDays=Number(CLIENTS.find(c=>c.code===code)?.settlementDays)||7;
    const deadline=oldest?new Date(oldest.date+'T12:00:00'):null;if(deadline)deadline.setDate(deadline.getDate()+deadlineDays);
    const dueAlert=deadline&&Date.now()>=deadline.getTime()-2*86400000;
    const rows=[];
    unconfirmed.forEach(batch=>rows.push(`<div class="partner-alert"><div><strong>Nova entrega disponível</strong><br><span>${fmtDate(batch.date)} · ${batch.items.reduce((s,i)=>s+Number(i.qty),0)} peça(s) em ${batch.items.length} item(ns)</span></div><button class="btn secondary" data-confirm-delivery="${escapeHtml(batch.id)}">Confirmar recebimento</button></div>`));
    if(unreadDocs.length)rows.push(`<div class="partner-alert"><div><strong>${unreadDocs.length} documento(s) ainda não confirmado(s)</strong><br><span>Abra o documento e marque a leitura.</span></div><a class="btn secondary" href="#client-documents">Consultar</a></div>`);
    if(dueAlert)rows.push(`<div class="partner-alert"><div><strong>Prazo de acerto ${Date.now()>deadline.getTime()?'vencido':'próximo'}</strong><br><span>Referência: ${fmtDate(deadline.toISOString().slice(0,10))} · ${fmtMoney(pending.reduce((s,a)=>s+Number(a.qty)*movementUnitPrice(a),0))}</span></div><a class="btn whatsapp" href="https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Quero verificar meu acerto de consignação. Código: '+code)}" target="_blank" rel="noopener">Conversar</a></div>`);
    if(pendingOrders.length)rows.push(`<div class="partner-alert good"><div><strong>${pendingOrders.length} pedido(s) em acompanhamento</strong><br><span>A situação aparece na seção “Meus pedidos”.</span></div><a class="btn secondary" href="#client-requests">Ver pedidos</a></div>`);
    if(reportedSales.length)rows.push(`<div class="partner-alert good"><div><strong>${reportedSales.length} venda(s) aguardando conferência</strong><br><span>A HL recebeu sua comunicação. O estoque será atualizado após a aprovação.</span></div></div>`);
    alerts.innerHTML=rows.length?rows.join(''):`<div class="partner-alert good"><div><strong>Tudo em dia</strong><br><span>Não há novas confirmações ou avisos no momento.</span></div></div>`;
    alerts.querySelectorAll('[data-confirm-delivery]').forEach(btn=>btn.addEventListener('click',async()=>{
      btn.disabled=true;btn.textContent='Confirmando…';
      try{await submitPartnerAction('delivery_confirmed',{targetId:btn.dataset.confirmDelivery});renderPartnerCenter(code);renderClientDocuments(code);logPartnerActivity('delivery_confirmed','historico',0,{batchId:btn.dataset.confirmDelivery});}
      catch(error){alert(isMissingSecurityFunction(error)?'Execute o SQL atualizado do Pacote 5 no Supabase.':'Não foi possível confirmar agora. Tente novamente.');btn.disabled=false;btn.textContent='Confirmar recebimento';}
    }));
    const saleProducts=clientStats(code).products.filter(r=>r.saldo>0);
    const select=document.getElementById('partner-sale-product');
    select.innerHTML='<option value="">Selecione…</option>'+saleProducts.map(r=>`<option value="${escapeHtml(r.code)}" data-color="${escapeHtml(r.color||'')}">${escapeHtml(r.name)} · ${escapeHtml(r.color||'Sem cor')} (${r.saldo} em posse)</option>`).join('');
    document.getElementById('partner-sale-date').value=todayISO();
    document.getElementById('partner-support-btn').href=`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Preciso de ajuda na Área do Parceiro. Código: '+code)}`;
    renderPartnerPeriod(code,Number(document.querySelector('#partner-period button.active')?.dataset.months||1));
  }
  function renderPartnerPeriod(code,months){
    const cutoff=months?new Date(new Date().setMonth(new Date().getMonth()-months)):null;
    const inPeriod=item=>!cutoff||new Date((item.date||todayISO())+'T12:00:00')>=cutoff;
    const sales=ACERTOS.filter(a=>a.clientCode===code&&inPeriod(a));
    const sold=sales.reduce((s,a)=>s+Number(a.qty||0),0);
    const transfer=sales.reduce((s,a)=>s+Number(a.qty||0)*movementUnitPrice(a),0);
    const stock=clientStats(code).totals.saldo;
    document.getElementById('partner-period-summary').innerHTML=`<div class="partner-mini-stat"><span>Peças vendidas</span><b>${sold}</b></div><div class="partner-mini-stat"><span>Valor de repasse</span><b>${fmtMoney(transfer)}</b></div><div class="partner-mini-stat"><span>Estoque em posse</span><b>${stock} peça(s)</b></div>`;
  }
  function productName(code){ const p = PRODUCTS.find(p=>p.code===code); return p ? p.name : code; }
  function clientName(code){ const c = CLIENTS.find(c=>c.code===code); return c ? c.name : code; }
  function clientLinkHtml(code){
    return `<a href="#" class="client-link" data-goto-client="${escapeHtml(code)}" title="Ver cadastro deste cliente">${escapeHtml(clientName(code))} <span class="client-link-code">(${escapeHtml(code)})</span></a>`;
  }
  function productPrice(code){ const p = PRODUCTS.find(p=>p.code===code); return p ? Number(p.price) : 0; }
  function movementUnitPrice(item){
    const saved=Number(item?.unitPrice);return item?.unitPrice!=null&&Number.isFinite(saved)&&saved>=0?saved:productPrice(item?.productCode);
  }
  function movementPublicPrice(item){
    const saved=Number(item?.publicUnitPrice);if(item?.publicUnitPrice!=null&&Number.isFinite(saved)&&saved>=0)return saved;
    const product=PRODUCTS.find(p=>p.code===item?.productCode);return product?getPublicPrice(product,item?.color||''):0;
  }
  function movementProductName(item){return String(item?.productNameSnapshot||productName(item?.productCode)||item?.productCode||'Produto');}
  function movementColorName(item){return String(item?.colorNameSnapshot!=null?item.colorNameSnapshot:(item?.color||''));}
  function withMovementSnapshot(item,kind='consignment',source='captured'){
    const product=PRODUCTS.find(p=>p.code===item.productCode),qty=Math.max(1,Number(item.qty)||1),directTotal=Number(item.total);
    const unitPrice=kind==='direct'&&Number.isFinite(directTotal)&&directTotal>=0?directTotal/qty:Number(product?.price||0);
    const publicUnitPrice=product?getPublicPrice(product,item.color||''):unitPrice;
    const directCost=productUnitCost(product||{});
    return {...item,
      unitPrice:item.unitPrice==null?unitPrice:Number(item.unitPrice),
      publicUnitPrice:item.publicUnitPrice==null?publicUnitPrice:Number(item.publicUnitPrice),
      costUnitPrice:item.costUnitPrice==null?(directCost==null?null:Number(directCost)):item.costUnitPrice,
      productNameSnapshot:item.productNameSnapshot||product?.name||item.productCode,
      colorNameSnapshot:item.colorNameSnapshot!=null?item.colorNameSnapshot:(item.color||''),
      priceSnapshotAt:item.priceSnapshotAt||new Date().toISOString(),
      priceSnapshotSource:item.priceSnapshotSource||source
    };
  }
  async function ensureHistoricalPriceSnapshots(){
    if(historicalSnapshotsChecked)return;
    const marker=await getJSON(HISTORICAL_SNAPSHOT_KEY,null);
    if(marker?.completed){historicalSnapshotsChecked=true;return;}
    const clone=value=>JSON.parse(JSON.stringify(value));
    const original={entregas:clone(ENTREGAS),devolucoes:clone(DEVOLUCOES),acertos:clone(ACERTOS),vendas:clone(VENDAS)};
    const migrated={
      entregas:ENTREGAS.map(item=>withMovementSnapshot(item,'consignment','legacy-current-price')),
      devolucoes:DEVOLUCOES.map(item=>withMovementSnapshot(item,'consignment','legacy-current-price')),
      acertos:ACERTOS.map(item=>withMovementSnapshot(item,'consignment','legacy-current-price')),
      vendas:VENDAS.map(item=>withMovementSnapshot(item,'direct','legacy-recorded-total'))
    };
    const changed=Object.keys(migrated).filter(key=>JSON.stringify(original[key])!==JSON.stringify(migrated[key]));
    const completedAt=new Date().toISOString();
    const markerValue={completed:true,completedAt,migratedKeys:changed};
    if(changed.length){
      const backupKey=`backup_precos_historicos_${Date.now()}`;
      const changes={
        [backupKey]:{createdAt:completedAt,reason:'Antes de fixar valores históricos',...original},
        ...Object.fromEntries(changed.map(key=>[key,migrated[key]])),
        [HISTORICAL_SNAPSHOT_KEY]:markerValue
      };
      await saveJSONBundle(changes,'proteção dos valores históricos');
      ENTREGAS=migrated.entregas;DEVOLUCOES=migrated.devolucoes;ACERTOS=migrated.acertos;VENDAS=migrated.vendas;
      showToast('Histórico financeiro protegido. Os valores anteriores foram congelados para não mudarem com futuros reajustes.');
    }else await setJSON(HISTORICAL_SNAPSHOT_KEY,markerValue);
    historicalSnapshotsChecked=true;
  }

  function buildClientReport(clientCode){
    const client = CLIENTS.find(c=>c.code===clientCode);
    if(!client) return null;
    const rows=clientStats(clientCode).products.filter(item=>item.saldo>0).map(item=>({code:item.code,name:item.name,color:item.color||'—',saldo:item.saldo}));
    rows.sort((a,b)=> a.name.localeCompare(b.name) || a.color.localeCompare(b.color));
    return { client, rows };
  }

  function renderClientReport(clientCode){
    const wrap = document.getElementById('rep-preview-wrap');
    const container = document.getElementById('print-report');
    const report = buildClientReport(clientCode);
    if(!report){ wrap.style.display = 'none'; return; }
    const { client, rows } = report;
    const total = rows.reduce((s,r)=>s+r.saldo, 0);
    const rowsHtml = rows.length ? rows.map(r=>`
      <tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.color)}</td><td style="text-align:center;">${r.saldo}</td><td></td></tr>
    `).join('') : `<tr><td colspan="5" style="text-align:center;">Nenhum item em posse deste lojista no momento.</td></tr>`;
    container.innerHTML = `
      <h2 style="font-family:'Space Grotesk';margin-bottom:4px;">HL 3D Solutions — Relatório de Conferência</h2>
      <p style="margin:0 0 4px 0;"><strong>Lojista:</strong> ${escapeHtml(client.name)} (${escapeHtml(client.code)})</p>
      <p style="margin:0 0 16px 0;"><strong>Data:</strong> ${fmtDate(todayISO())} &nbsp;·&nbsp; <strong>Total de itens em posse:</strong> ${total}</p>
      <table>
        <thead><tr><th>Código</th><th>Produto</th><th>Cor</th><th>Qtd. em posse</th><th>Conferido (✓)</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top:30px;">Assinatura do lojista: _______________________________________ &nbsp;&nbsp; Data: ______ / ______ / ______</p>
    `;
    wrap.style.display = 'block';
  }

  document.getElementById('rep-generate-btn').addEventListener('click', async ()=>{
    await refreshData();
    const clientCode = document.getElementById('rep-client').value;
    if(!clientCode) return;
    renderClientReport(clientCode);
  });
  document.getElementById('rep-print-btn').addEventListener('click', ()=>{
    window.print();
  });

  // ---------- DOCUMENTOS ----------
  const docIcon = { 'Contrato':'📄', 'Comprovante de Entrega':'📦', 'Comprovante de Devolução':'↩️', 'Comprovante de Acerto':'💰', 'Outro':'📎' };
  const DOCS_BUCKET = 'documentos';

  async function openDocument(doc){
    if(doc.path){
      try{
        const { data, error } = await supabaseClient.storage.from(DOCS_BUCKET).createSignedUrl(doc.path, 60);
        if(error || !data){ alert('Não foi possível abrir o arquivo agora. Tente novamente em instantes.'); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
      }catch(e){ alert('Não foi possível abrir o arquivo agora. Tente novamente em instantes.'); }
    } else if(doc.url){
      window.open(doc.url, '_blank', 'noopener');
    }
  }
  window.hlOpenDocument = openDocument;

  function renderDocList(){
    const list = document.getElementById('doc-list');
    if(!list) return;
    if(DOCUMENTS.length === 0){ list.innerHTML = `<div class="empty">Nenhum documento cadastrado.</div>`; return; }
    list.innerHTML = DOCUMENTS.slice().reverse().map(d=>{
      const client = CLIENTS.find(c=>c.code===d.clientCode);
      const clientLabel = client ? `${client.name} (${client.code})` : d.clientCode;
      return `
      <div class="doc-card">
        <div class="doc-info">
          <span class="doc-icon">${docIcon[d.type] || '📎'}</span>
          <div>
            <div class="doc-title">${escapeHtml(d.title || d.type)}</div>
            <div class="doc-meta">${escapeHtml(clientLabel)} · ${escapeHtml(d.type)} · ${fmtDate(d.date)}${d.path ? ' · 🔒 privado' : ''}</div>
            ${d.uploadedAt ? `<div class="doc-meta" style="opacity:.75;">Enviado em ${fmtDateTime(d.uploadedAt)}</div>` : ''}
          </div>
        </div>
        <span class="actions">
          <button data-open-doc="${d.id}" class="btn secondary" style="padding:6px 12px;font-size:11px;">Abrir</button>
          <button data-del-doc="${d.id}">Remover</button>
        </span>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-open-doc]').forEach(btn=>btn.addEventListener('click', ()=>{
      const doc = DOCUMENTS.find(d=>d.id===btn.dataset.openDoc);
      if(doc) openDocument(doc);
    }));
    list.querySelectorAll('[data-del-doc]').forEach(btn=>btn.addEventListener('click', async ()=>{
      DOCUMENTS = await getJSON('documents', DOCUMENTS);
      const doc = DOCUMENTS.find(d=>d.id===btn.dataset.delDoc);
      if(doc && doc.path){
        try{ await supabaseClient.storage.from(DOCS_BUCKET).remove([doc.path]); }catch(e){}
      }
      DOCUMENTS = DOCUMENTS.filter(d=>d.id!==btn.dataset.delDoc);
      await setJSON('documents', DOCUMENTS);
      renderDocList();
    }));
  }

  document.getElementById('doc-add-btn').addEventListener('click', async ()=>{
    const clientCode = document.getElementById('doc-client').value;
    const type = document.getElementById('doc-type').value;
    const title = document.getElementById('doc-title').value.trim();
    const date = document.getElementById('doc-date').value || todayISO();
    const url = document.getElementById('doc-url').value.trim();
    const fileInput = document.getElementById('doc-file');
    const file = fileInput.files[0];
    const msg = document.getElementById('doc-msg');
    if(!clientCode || (!url && !file)){ msg.innerHTML = '<div class="msg err">Escolha o lojista e envie um arquivo ou cole uma URL.</div>'; return; }

    const btn = document.getElementById('doc-add-btn');
    btn.disabled = true; btn.textContent = 'Enviando…';

    let path = null;
    if(file){
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      path = `${clientCode}/${Date.now()}_${safeName}`;
      try{
        const { error } = await supabaseClient.storage.from(DOCS_BUCKET).upload(path, file);
        if(error){
          msg.innerHTML = `<div class="msg err">Falha ao enviar o arquivo: ${escapeHtml(error.message)}</div>`;
          btn.disabled = false; btn.textContent = 'Adicionar documento';
          return;
        }
      }catch(e){
        msg.innerHTML = '<div class="msg err">Falha ao enviar o arquivo. Confira se o bucket "documentos" foi criado.</div>';
        btn.disabled = false; btn.textContent = 'Adicionar documento';
        return;
      }
    }

    DOCUMENTS = await getJSON('documents', DOCUMENTS);
    const id = nextSeqId(DOCUMENTS, 'DOC');
    const doc = { id, clientCode, type, title, date, uploadedAt: Date.now() };
    if(path) doc.path = path; else doc.url = url;
    DOCUMENTS.push(doc);
    await setJSON('documents', DOCUMENTS);
    msg.innerHTML = '<div class="msg ok">Documento adicionado.</div>';
    document.getElementById('doc-title').value = '';
    document.getElementById('doc-url').value = '';
    fileInput.value = '';
    btn.disabled = false; btn.textContent = 'Adicionar documento';
    renderDocList();
  });

  function requestItems(req){
    if(Array.isArray(req?.items)&&req.items.length)return req.items;
    return req?.productCode?[{productCode:req.productCode,color:req.color||'',qty:Number(req.qty)||1,type:req.type||'reposicao'}]:[];
  }
  function requestHasProduction(req){return requestItems(req).some(item=>(item.type||req.type)==='producao');}
  function requestItemsHtml(req){
    return requestItems(req).map(item=>`${Number(item.qty)||1}x ${escapeHtml(productName(item.productCode))}${item.color?' — '+escapeHtml(item.color):''}`).join('<br>');
  }
  function requestItemsText(req){
    return requestItems(req).map(item=>`• ${Number(item.qty)||1}x ${productName(item.productCode)}${item.color?' ('+item.color+')':''}${(item.type||req.type)==='producao'?' [PRODUÇÃO]':''}`).join('\n');
  }

  function whatsappLink(req){
    const client = CLIENTS.find(c=>c.code===req.clientCode);
    const clientLabel = client ? `${client.name} (${client.code})` : req.clientCode;
    const titulo = requestHasProduction(req) ? 'Novo pedido de reposição / produção' : 'Novo pedido de reposição';
    let text = `${titulo} — ${req.id}\nCliente: ${clientLabel}\n\n${requestItemsText(req)}`;
    if(req.note) text += `\nObservação: ${req.note}`;
    return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }
  function whatsappBtn(req){
    return `<a class="btn whatsapp" href="${whatsappLink(req)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.1.1-.3 0-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 4 3.5.6.2 1 .4 1.3.5.6.2 1.1.1 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.4-.3z"/></svg>
      Avisar no WhatsApp</a>`;
  }

  // ---------- ÁREA DO CLIENTE ----------
  const CLIENT_SESSION_KEY = 'hl_partner_session';
  const PARTNER_TOUR_VERSION = 'v1';
  const PARTNER_TOUR_STEPS = [
    {icon:'👋',title:'Sua área em poucos passos',description:'Aqui você acompanha tudo o que está relacionado à sua parceria com a HL 3D Solutions. Este guia mostra onde consultar produtos, valores, pedidos, histórico e documentos.',tip:'Você pode fechar o guia a qualquer momento e reabri-lo pelo botão “Como usar”.',target:'client-dashboard'},
    {icon:'📊',title:'Resumo da parceria',description:'Os cartões do início mostram quantas peças estão em sua posse, o valor do estoque, o que já foi pago, o que está pendente e uma estimativa da sua margem nas vendas.',tip:'Se algum número parecer diferente do seu controle, entre em contato com a HL antes de fazer um novo acerto.',target:'stat-saldo'},
    {icon:'🎨',title:'Produtos em sua posse',description:'A tabela “Saldo por produto” discrimina cada produto por cor e apresenta entregas, devoluções, vendas, saldo, valores pagos e pendentes.',tip:'No celular, deslize a tabela para o lado para consultar todas as colunas.',target:'client-product-table'},
    {icon:'📦',title:'Pedidos e reposição',description:'Em “Meus pedidos” você acompanha as solicitações enviadas. No catálogo de parceiro, escolha o produto, a cor e a quantidade; depois confira o carrinho antes de enviar.',tip:'Use o campo de observação para informar prazo, preferência ou qualquer detalhe importante.',target:'client-requests'},
    {icon:'🕘',title:'Histórico de movimentações',description:'O histórico reúne entregas, devoluções, vendas e acertos em ordem de data. Toque em “ver” para abrir ou recolher a lista.',tip:'Este registro ajuda a conferir quando cada alteração aconteceu e quais itens participaram da movimentação.',target:'client-history-toggle'},
    {icon:'📄',title:'Documentos',description:'Em “Meus documentos” ficam disponíveis contratos, comprovantes, termos de entrega, devolução e acerto enviados pela HL.',tip:'Use “Baixar / Abrir” para consultar o arquivo. Caso um documento esperado não apareça, solicite o envio à HL.',target:'client-documents'},
    {icon:'🛒',title:'Catálogo exclusivo',description:'O catálogo do parceiro mostra o preço de repasse, o preço sugerido ao público e a margem possível. Escolha uma cor para adicionar itens ao carrinho de reposição.',tip:'O preço de repasse é exclusivo da sua área e não aparece no catálogo público.',target:'consig-catalog-section'}
  ];
  let partnerTourStep=0,partnerTourLastFocus=null,partnerTourAutoOffered=false;
  function partnerTourStorageKey(){return `hl_partner_tour_${PARTNER_TOUR_VERSION}_${String(currentClientCode||'').toUpperCase()}`;}
  function partnerTourWasHidden(){try{return localStorage.getItem(partnerTourStorageKey())==='hidden';}catch(e){return false;}}
  function savePartnerTourPreference(){
    if(!document.getElementById('partner-tour-hide').checked)return;
    try{localStorage.setItem(partnerTourStorageKey(),'hidden');}catch(e){}
  }
  function renderPartnerTourStep(){
    const step=PARTNER_TOUR_STEPS[partnerTourStep];
    document.getElementById('partner-tour-icon').textContent=step.icon;
    document.getElementById('partner-tour-step-title').textContent=step.title;
    document.getElementById('partner-tour-description').textContent=step.description;
    document.querySelector('#partner-tour-tip span:last-child').textContent=step.tip;
    document.getElementById('partner-tour-count').textContent=`${partnerTourStep+1} de ${PARTNER_TOUR_STEPS.length}`;
    document.getElementById('partner-tour-dots').innerHTML=PARTNER_TOUR_STEPS.map((_,i)=>`<span class="partner-tour-dot ${i===partnerTourStep?'active':''}"></span>`).join('');
    document.getElementById('partner-tour-prev').style.visibility=partnerTourStep===0?'hidden':'visible';
    document.getElementById('partner-tour-next').textContent=partnerTourStep===PARTNER_TOUR_STEPS.length-1?'Concluir':'Próximo';
    document.getElementById('partner-tour-location').style.display=step.target==='client-dashboard'?'none':'inline-flex';
  }
  function openPartnerTour(force=false){
    if(!currentClientCode||(!force&&partnerTourWasHidden()))return;
    partnerTourStep=0;partnerTourLastFocus=document.activeElement;
    document.getElementById('partner-tour-hide').checked=false;
    renderPartnerTourStep();
    const overlay=document.getElementById('partner-tour-overlay');overlay.classList.add('open');
    document.body.style.overflow='hidden';
    setTimeout(()=>document.getElementById('partner-tour-close').focus(),0);
    logPartnerActivity('tutorial_open','resumo',0,{automatic:!force});
  }
  function closePartnerTour(){
    const overlay=document.getElementById('partner-tour-overlay');
    if(!overlay.classList.contains('open'))return;
    savePartnerTourPreference();overlay.classList.remove('open');document.body.style.overflow='';
    if(partnerTourLastFocus&&typeof partnerTourLastFocus.focus==='function')partnerTourLastFocus.focus();
  }
  function showPartnerTourLocation(){
    const step=PARTNER_TOUR_STEPS[partnerTourStep],target=document.getElementById(step.target);
    closePartnerTour();
    if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'center'}),80);
  }
  let partnerActivitySessionId=null,partnerActivityTimer=null,partnerActivitySection='resumo',partnerActivityScrollBound=false;
  const partnerDeviceType=()=>/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Android|iPhone|Mobile/i.test(navigator.userAgent)?'celular':'computador';
  function newPartnerActivitySessionId(){
    if(crypto.randomUUID)return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);});
  }
  function logPartnerActivity(eventType,section=partnerActivitySection,duration=0,metadata={}){
    if(!currentPartnerToken||!partnerActivitySessionId)return Promise.resolve(false);
    return supabaseClient.rpc('partner_log_activity',{p_access_token:currentPartnerToken,p_session_id:partnerActivitySessionId,p_event_type:eventType,p_section:section,p_duration_seconds:duration,p_metadata:metadata,p_device_type:partnerDeviceType()}).then(({error,data})=>{if(error)console.debug('Registro de atividade indisponível',error.message);return !error&&data===true;}).catch(()=>false);
  }
  function detectPartnerActivitySection(){
    if(!currentClientCode)return;
    const anchors=[['client-dashboard','resumo'],['client-product-table','produtos-em-posse'],['client-requests','pedidos'],['client-history-toggle','historico'],['client-documents','documentos'],['consig-catalog-section','catalogo']];
    let next='resumo';
    anchors.forEach(([id,section])=>{const el=document.getElementById(id);if(el&&el.getBoundingClientRect().top<=210)next=section;});
    if(next!==partnerActivitySection){partnerActivitySection=next;logPartnerActivity('section_view',next);}
  }
  function startPartnerActivity(){
    if(!currentPartnerToken||!currentClientCode)return;
    if(partnerActivitySessionId)return;
    partnerActivitySessionId=newPartnerActivitySessionId();partnerActivitySection='resumo';
    logPartnerActivity('session_start','resumo');logPartnerActivity('section_view','resumo');
    clearInterval(partnerActivityTimer);partnerActivityTimer=setInterval(()=>{if(document.visibilityState==='visible'&&currentClientCode)logPartnerActivity('heartbeat',partnerActivitySection,30);},30000);
    if(!partnerActivityScrollBound){window.addEventListener('scroll',detectPartnerActivitySection,{passive:true});partnerActivityScrollBound=true;}
  }
  function stopPartnerActivity(){
    if(partnerActivitySessionId)logPartnerActivity('session_end',partnerActivitySection);
    clearInterval(partnerActivityTimer);partnerActivityTimer=null;partnerActivitySessionId=null;partnerActivitySection='resumo';
  }

  async function unlockClient(code,pin){
    const normalized=String(code||'').trim().toUpperCase();
    const {data,error}=await supabaseClient.rpc('partner_login',{p_client_code:normalized,p_pin:String(pin||'')});
    if(error)throw error;
    const login=typeof data==='string'?JSON.parse(data):data;
    if(!login?.accessToken||!applyPartnerSnapshot(login.snapshot))return {ok:false,...(login||{})};
    currentPartnerToken=login.accessToken;
    try{ sessionStorage.setItem(CLIENT_SESSION_KEY,JSON.stringify({code:currentClientCode,token:currentPartnerToken})); }catch(e){}
    renderPortfolio();
    return {ok:true,status:'ok'};
  }
  async function activatePartnerAccess(code,activationCode,newPin){
    const {data,error}=await supabaseClient.rpc('partner_activate',{p_client_code:String(code||'').trim().toUpperCase(),p_activation_code:String(activationCode||'').trim().toUpperCase(),p_new_pin:String(newPin||'')});
    if(error)throw error;
    return typeof data==='string'?JSON.parse(data):data;
  }
  let partnerLockTimer=null;
  function setPartnerAccessDisabled(disabled){
    ['client-code-input','client-pin-input','client-access-btn'].forEach(id=>{document.getElementById(id).disabled=disabled;});
  }
  function showPartnerLock(lockedUntil){
    clearInterval(partnerLockTimer);
    const until=new Date(lockedUntil).getTime(),msg=document.getElementById('client-gate-msg');
    setPartnerAccessDisabled(true);
    const tick=()=>{
      const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));
      if(seconds<=0){clearInterval(partnerLockTimer);setPartnerAccessDisabled(false);document.getElementById('client-access-btn').textContent='Acessar minha conta';msg.innerHTML='<div class="msg ok">O bloqueio terminou. Você já pode tentar novamente.</div>';return;}
      const minutes=Math.floor(seconds/60),remaining=String(seconds%60).padStart(2,'0');
      msg.innerHTML=`<div class="msg err">Acesso temporariamente bloqueado após cinco tentativas incorretas. Tente novamente em <strong>${minutes}:${remaining}</strong>.</div>`;
    };
    tick();partnerLockTimer=setInterval(tick,1000);
  }
  function lockClient(){
    currentClientCode = null;
    PRODUCTS=PUBLIC_PRODUCTS;
    KNOWN_CATEGORIES=PUBLIC_CATEGORIES;
    ACERTOS=PUBLIC_SALES;
    CLIENTS=[];ENTREGAS=[];DEVOLUCOES=[];PEDIDOS=[];DOCUMENTS=[];VENDAS=[];PARTNER_ACTIONS=[];
    currentPartnerToken=null;
    try{ sessionStorage.removeItem(CLIENT_SESSION_KEY);localStorage.removeItem('hl_client_code'); }catch(e){}
    renderPortfolio();
  }

  function openClientDashboard(code){
    const client = CLIENTS.find(c=>c.code===code);
    if(!client) return;
    document.getElementById('client-gate').style.display = 'none';
    document.getElementById('client-dashboard').style.display = 'block';
    document.getElementById('client-code-display').textContent = client.code;
    document.getElementById('client-name-display').textContent = client.name;
    document.getElementById('client-avatar-letter').textContent = (client.name||'?').trim().charAt(0).toUpperCase();
    startPartnerActivity();
    if(!partnerTourAutoOffered){partnerTourAutoOffered=true;setTimeout(()=>openPartnerTour(false),450);}

    const { products, totals } = clientStats(client.code);
    document.getElementById('stat-saldo').textContent = totals.saldo;
    document.getElementById('stat-valor-estoque').textContent = fmtMoney(totals.valorEmEstoque);
    document.getElementById('stat-devido').textContent = fmtMoney(totals.devido);
    document.getElementById('stat-pendente').textContent = fmtMoney(totals.pendente);
    document.getElementById('stat-pago').textContent = fmtMoney(totals.pago);
    document.getElementById('stat-lucro').textContent = fmtMoney(totals.lucroEstimado);

    const tbody = document.getElementById('client-product-table');
    tbody.innerHTML = products.length ? products.map(r=>`
      <tr><td class="mono prod-link" data-client-open-product="${escapeHtml(r.code)}">${escapeHtml(r.name)}</td><td><span class="badge ${r.color?'entrega':'pendente'}">${escapeHtml(r.color||'Sem cor')}</span></td><td>${r.entregue}</td><td>${r.devolvido}</td><td>${r.vendido}</td>
      <td style="color:${r.saldo>0?'var(--teal)':'inherit'};font-weight:${r.saldo>0?'600':'400'};">${r.saldo}</td>
      <td>${fmtMoney(r.devido)}</td><td>${fmtMoney(r.pago)}</td>
      <td style="color:${r.pendente>0?'var(--mustard)':'inherit'};font-weight:${r.pendente>0?'600':'400'};">${fmtMoney(r.pendente)}</td></tr>
    `).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--muted);">Nenhuma movimentação registrada ainda.</td></tr>`;
    const cards=document.getElementById('client-product-cards');
    cards.innerHTML=products.length?products.map(r=>{const product=PRODUCTS.find(p=>p.code===r.code),image=product?.colors?.find(c=>(c.name||'')===(r.color||''))?.image||product?.image||'';return `<details class="client-product-card"><summary><span style="display:flex;align-items:center;gap:10px;"><span class="client-product-thumb" style="${image?`background-image:url('${String(image).replace(/'/g,'%27')}')`:''}">${image?'':'◇'}</span><span><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.color||'Sem cor')} · toque para ver detalhes</small></span></span><span class="badge ${r.saldo>0?'entrega':'pendente'}">${r.saldo} em posse</span></summary><div class="client-product-card-body"><div class="client-product-metric"><span>Entregue</span><b>${r.entregue}</b></div><div class="client-product-metric"><span>Vendido</span><b>${r.vendido}</b></div><div class="client-product-metric"><span>Devolvido</span><b>${r.devolvido}</b></div><div class="client-product-metric"><span>Pendente</span><b style="color:${r.pendente>0?'var(--mustard)':'inherit'}">${fmtMoney(r.pendente)}</b></div><div class="client-product-metric"><span>Devido</span><b>${fmtMoney(r.devido)}</b></div><div class="client-product-metric"><span>Pago</span><b style="color:var(--teal)">${fmtMoney(r.pago)}</b></div><button type="button" class="btn secondary client-product-open" data-client-open-product="${escapeHtml(r.code)}">Ver produto</button></div></details>`;}).join(''):'<div class="empty">Nenhuma movimentação registrada ainda.</div>';
    document.querySelectorAll('[data-client-open-product]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();window.hlOpenProduct(button.dataset.clientOpenProduct);}));

    renderClientRequests(client.code);

    const hist = clientHistory(client.code);
    const badgeClass = { entrega:'entrega', devolucao:'devolucao', acerto:'acerto', venda:'pago' };
    const badgeLabel = { entrega:'Entrega', devolucao:'Devolução', acerto:'Acerto', venda:'Compra paga' };
    const typeGlyph = { entrega:'▲', devolucao:'▼', acerto:'◆', venda:'✓' };
    document.getElementById('client-history').innerHTML = hist.length ? hist.map(h=>{
      const isGroupedEntrega = h.type === 'entrega' && h.items && h.items.length > 1;
      const itemsBreakdown = isGroupedEntrega ? `
        <div class="ticket-breakdown" id="hist-breakdown-${h.id}" style="display:none;">
          ${h.items.map(i=>`<div class="ticket-breakdown-row">${i.qty}x ${escapeHtml(movementProductName(i))}${movementColorName(i) ? ' ('+escapeHtml(movementColorName(i))+')' : ''} — ${fmtMoney(Number(i.qty)*movementUnitPrice(i))}</div>`).join('')}
        </div>` : '';
      return `
      <div class="ticket t-${h.type} ${isGroupedEntrega ? 'ticket-expandable' : ''}" ${isGroupedEntrega ? `data-toggle-hist="${h.id}"` : ''}>
        <div class="left">
          <div class="desc"><span class="glyph">${typeGlyph[h.type]}</span>${escapeHtml(h.desc)}${isGroupedEntrega ? ' <span class="hist-expand-arrow" id="hist-arrow-'+escapeHtml(h.id)+'">▾</span>' : ''}</div>
          <div class="id">${h.id.startsWith('B') ? '' : escapeHtml(h.id)+' · '}${fmtDate(h.date)}</div>
        </div>
        <div>
          <span class="badge ${badgeClass[h.type]}">${badgeLabel[h.type]}</span>
          ${h.status ? `<span class="badge ${['Pago','Pendente'].includes(h.status)?h.status.toLowerCase():'pendente'}" style="margin-left:6px;">${escapeHtml(h.status)}</span>` : ''}
        </div>
      </div>${itemsBreakdown}`;
    }).join('') : `<div class="empty"><div class="glyph">◇</div>Sem movimentações por enquanto.</div>`;

    document.querySelectorAll('[data-toggle-hist]').forEach(el=>el.addEventListener('click', ()=>{
      const id = el.dataset.toggleHist;
      const breakdown = document.getElementById('hist-breakdown-'+id);
      const arrow = document.getElementById('hist-arrow-'+id);
      const isOpen = breakdown.style.display === 'block';
      breakdown.style.display = isOpen ? 'none' : 'block';
      arrow.textContent = isOpen ? '▾' : '▴';
    }));

    renderConsignadoCatalog();
    renderCart();
    renderClientDocuments(client.code);
    renderPartnerCenter(client.code);
  }

  function renderClientDocuments(code){
    const wrap = document.getElementById('client-documents');
    if(!wrap) return;
    const docs = DOCUMENTS.filter(d=>d.clientCode===code).slice().reverse();
    if(docs.length === 0){
      document.getElementById('partner-docs-summary').textContent='Nenhum documento disponível';
      wrap.innerHTML = `<div class="empty"><div class="glyph">◇</div>Nenhum documento disponível ainda.</div>`;
      return;
    }
    const readCount=docs.filter(d=>partnerAction('document_read',d.id)).length;
    document.getElementById('partner-docs-summary').textContent=`${readCount} de ${docs.length} com leitura confirmada`;
    wrap.innerHTML = docs.map(d=>`
      <div class="doc-card">
        <div class="doc-info">
          <span class="doc-icon">${docIcon[d.type] || '📎'}</span>
          <div>
            <div class="doc-title">${escapeHtml(d.title || d.type)}</div>
            <div class="doc-meta">${escapeHtml(d.type)} · ${fmtDate(d.date)}</div>
            ${d.uploadedAt ? `<div class="doc-meta" style="opacity:.75;">Enviado em ${fmtDateTime(d.uploadedAt)}</div>` : ''}
            <div class="doc-read">${partnerAction('document_read',d.id)?'✓ Leitura confirmada em '+fmtDateTime(partnerAction('document_read',d.id).createdAt):'Leitura ainda não confirmada'}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;"><button data-open-client-doc="${d.id}" class="btn secondary" style="padding:7px 14px;font-size:11px;">Baixar / Abrir</button>${partnerAction('document_read',d.id)?'':`<button data-read-client-doc="${d.id}" class="btn" style="padding:7px 14px;font-size:11px;">Confirmar leitura</button>`}</div>
      </div>`).join('');
    wrap.querySelectorAll('[data-open-client-doc]').forEach(btn=>btn.addEventListener('click', ()=>{
      const doc = DOCUMENTS.find(d=>d.id===btn.dataset.openClientDoc);
      if(doc) openDocument(doc);
    }));
    wrap.querySelectorAll('[data-read-client-doc]').forEach(btn=>btn.addEventListener('click',async()=>{
      btn.disabled=true;btn.textContent='Confirmando…';
      try{await submitPartnerAction('document_read',{targetId:btn.dataset.readClientDoc});renderClientDocuments(code);renderPartnerCenter(code);logPartnerActivity('document_read','documentos',0,{documentId:btn.dataset.readClientDoc});}
      catch(error){alert(isMissingSecurityFunction(error)?'Execute o SQL atualizado do Pacote 5 no Supabase.':'Não foi possível confirmar a leitura agora.');btn.disabled=false;btn.textContent='Confirmar leitura';}
    }));
  }

  let consigSortOrder = 'relevancia';
  function renderConsignadoCatalog(){
    const grid = document.getElementById('consig-grid');
    if(!grid) return;
    renderPromoCarousel('consig-promo-wrap','consig-promo-carousel','consignado');
    renderTopSellers('consig-top-sellers-wrap','consig-top-sellers','consignado');
    const active = sortProducts(PRODUCTS.filter(p => p.active !== false&&isConsignmentAvailable(p)).filter(p=>matchesSearch(p, consigSearchQuery)), consigSortOrder);
    if(active.length === 0){
      grid.innerHTML = `<div class="empty"><div class="glyph">◇</div>Nenhum produto encontrado${consigSearchQuery ? ' para "'+escapeHtml(consigSearchQuery)+'"' : ''}.</div>`;
      return;
    }
    grid.innerHTML = active.map(p=>{
      const colors = p.colors || [];
      const colorsHtml = colors.length
        ? `<div class="portfolio-colors">${colors.map(c=>`
            <button type="button" class="color-pill ${(!p.onDemand && Number(c.stock)<=0)?'out':''}" onclick="window.hlAddToCart('${p.code}',decodeURIComponent('${encodeURIComponent(c.name).replace(/'/g,'%27')}'))">+ ${escapeHtml(c.name)} · ${fmtMoney(getPublicPrice(p,c.name))}${getPromoInfo(p, c.name) ? ' 🔥' : ''}${(!p.onDemand && Number(c.stock)<=0)?' • sem estoque':''}</button>`).join('')}</div>`
        : `<button type="button" class="btn secondary" style="margin-top:8px;padding:6px 12px;font-size:11px;" onclick="window.hlAddToCart('${p.code}','')">+ ${p.onDemand ? 'Encomendar' : 'Adicionar ao carrinho'}</button>`;
      const publicPrice = p.publicPrice != null ? Number(p.publicPrice) : null;
      const margin = publicPrice != null ? publicPrice - Number(p.price) : null;
      const marginHtml = margin != null
        ? `<div class="margin-hint">Lucro possível: ${fmtMoney(margin)} (revendendo pelo preço ao público)</div>`
        : '';
      const promoInfo = getPromoInfo(p);
      const promoColorConsig = !promoInfo ? colors.find(c=>getPromoInfo(p, c.name)) : null;
      const colorOnlyPromoConsig = !!promoColorConsig;
      const cardImageConsig = (promoColorConsig && promoColorConsig.image) ? promoColorConsig.image : p.image;
      const publicPriceHtml = promoInfo
        ? `<div class="price"><span class="lbl">Preço ao público</span>
             <span class="promo-old-price" style="margin-right:6px;">${fmtMoney(promoInfo.base)}</span>
             <span class="promo-new-price">${fmtMoney(promoInfo.promo)}</span>
             <span class="promo-pct-badge" style="margin-left:6px;">🔥 -${promoInfo.pct}%</span>
           </div>`
        : `<div class="price"><span class="lbl">Preço ao público</span>${publicPrice != null ? fmtMoney(publicPrice) : '—'}
             ${colorOnlyPromoConsig ? `<span class="promo-pct-badge" style="margin-left:6px;">🔥 promoção na cor ${promoColorConsig.name}</span>` : ''}
           </div>`;
      pickerQty[p.code] = pickerQty[p.code] || 1;
      return `
      <div class="card ${(promoInfo || colorOnlyPromoConsig) ? 'on-sale' : ''}">
        <div class="img" style="${cardImageConsig ? `background-image:url('${cardImageConsig.replace(/'/g,"")}')` : ''}">${cardImageConsig ? '' : 'sem imagem'}</div>
        <div class="body">
          ${tagsHtml(p)}
          ${p.onDemand ? '<span class="badge acerto" style="margin-left:4px;">Sob encomenda</span>' : ''}
          ${p.customizable ? `<span class="badge customizavel" style="margin-left:4px;">✨ Personalizável${p.customizableMinQty ? ' (mín. '+p.customizableMinQty+')' : ''}</span>` : ''}
          <h3>${escapeHtml(p.name)}</h3>
          <div class="code">${escapeHtml(p.code)}</div>
          ${publicPriceHtml}
          <div class="price" style="margin-top:6px;color:var(--teal);"><span class="lbl">Seu preço (repasse)</span>${fmtMoney(p.price)}</div>
          ${marginHtml}
          <div class="qty-picker">
            <label>Qtd. a adicionar</label>
            <button type="button" class="cart-qty-btn" onclick="window.hlAdjustPicker('${p.code}',-1)">−</button>
            <span class="mono" id="picker-qty-${p.code}">${pickerQty[p.code]}</span>
            <button type="button" class="cart-qty-btn" onclick="window.hlAdjustPicker('${p.code}',1)">+</button>
          </div>
          ${colorsHtml}
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('consig-search').addEventListener('input', (e)=>{
    consigSearchQuery = e.target.value.trim();
    renderConsignadoCatalog();
  });
  document.getElementById('consig-sort').addEventListener('change', (e)=>{
    consigSortOrder = e.target.value;
    renderConsignadoCatalog();
  });

  // ---------- CARRINHO DE REPOSIÇÃO ----------
  let reposicaoCart = loadCartStorage('hl_reposicao_cart');
  let pickerQty = {};

  window.hlAdjustPicker = function(code, delta){
    const current = pickerQty[code] || 1;
    pickerQty[code] = Math.max(1, current + delta);
    const el = document.getElementById('picker-qty-'+code);
    if(el) el.textContent = pickerQty[code];
  };

  window.hlAddToCart = function(code, color){
    const product=PRODUCTS.find(p=>p.code===code);
    if(!isConsignmentAvailable(product)){alert('Este produto está disponível somente para venda direta e não pode ser solicitado em consignação.');return;}
    const qtyToAdd = pickerQty[code] || 1;
    const existing = reposicaoCart.find(i=>i.productCode===code && i.color===color);
    if(existing){ existing.qty += qtyToAdd; }
    else { reposicaoCart.push({ productCode: code, color, qty: qtyToAdd }); }
    renderCart();
  };

  function renderCart(){
    reposicaoCart=reposicaoCart.filter(item=>isConsignmentAvailable(PRODUCTS.find(p=>p.code===item.productCode)));
    saveCartStorage('hl_reposicao_cart', reposicaoCart);
    const wrap = document.getElementById('cart-items');
    const noteField = document.getElementById('cart-note-field');
    const submitBtn = document.getElementById('cart-submit-btn');
    const badge = document.getElementById('cart-count-badge');
    if(!wrap) return;
    renderFloatingCart();
    if(reposicaoCart.length === 0){
      wrap.innerHTML = `<div class="empty" style="padding:20px;"><div class="glyph">◇</div>Toque numa cor do catálogo abaixo para adicionar itens aqui.</div>`;
      noteField.style.display = 'none';
      submitBtn.style.display = 'none';
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'inline-block';
    badge.textContent = reposicaoCart.reduce((s,i)=>s+i.qty,0);
    wrap.innerHTML = reposicaoCart.map((item,idx)=>{
      const p = PRODUCTS.find(p=>p.code===item.productCode);
      const name = p ? p.name : item.productCode;
      const c = p && p.colors ? p.colors.find(c=>c.name===item.color) : null;
      const stock = c ? Number(c.stock) : null;
      const willBeProducao = (p && p.onDemand) || (stock != null && item.qty > stock);
      return `
      <div class="ticket" style="margin-bottom:8px;">
        <div class="left">
          <div class="desc">${name}${item.color ? ' — '+item.color : ''} ${willBeProducao ? '<span class="badge acerto" style="margin-left:4px;">'+((p&&p.onDemand)?'Sob encomenda':'Produção')+'</span>' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button data-cart-dec="${idx}" class="cart-qty-btn">−</button>
          <span class="mono" style="min-width:20px;text-align:center;">${item.qty}</span>
          <button data-cart-inc="${idx}" class="cart-qty-btn">+</button>
          <button data-cart-remove="${idx}" class="cart-qty-btn" title="Remover">✕</button>
        </div>
      </div>`;
    }).join('');
    noteField.style.display = 'block';
    submitBtn.style.display = 'inline-block';

    wrap.querySelectorAll('[data-cart-inc]').forEach(b=>b.addEventListener('click', ()=>{
      reposicaoCart[+b.dataset.cartInc].qty += 1; renderCart();
    }));
    wrap.querySelectorAll('[data-cart-dec]').forEach(b=>b.addEventListener('click', ()=>{
      const idx = +b.dataset.cartDec;
      reposicaoCart[idx].qty -= 1;
      if(reposicaoCart[idx].qty <= 0) reposicaoCart.splice(idx,1);
      renderCart();
    }));
    wrap.querySelectorAll('[data-cart-remove]').forEach(b=>b.addEventListener('click', ()=>{
      reposicaoCart.splice(+b.dataset.cartRemove,1); renderCart();
    }));
  }

  function renderFloatingCart(){
    const totalQty = reposicaoCart.reduce((s,i)=>s+i.qty,0);

    const fab = document.getElementById('mobile-cart-fab');
    if(fab){
      if(totalQty > 0){
        fab.classList.add('show');
        document.getElementById('mobile-cart-fab-badge').textContent = totalQty;
      } else {
        fab.classList.remove('show');
      }
    }

    const el = document.getElementById('floating-cart');
    if(!el) return;
    if(reposicaoCart.length === 0){ el.style.display = 'none'; return; }
    el.style.display = 'block';
    document.getElementById('floating-cart-badge').textContent = totalQty;
    document.getElementById('floating-cart-items').innerHTML = reposicaoCart.map(item=>{
      const p = PRODUCTS.find(p=>p.code===item.productCode);
      const name = p ? p.name : item.productCode;
      return `<div class="floating-cart-item"><span>${name}${item.color ? ' ('+item.color+')' : ''}</span><span class="fci-qty">×${item.qty}</span></div>`;
    }).join('');
  }

  document.getElementById('cart-submit-btn').addEventListener('click', async ()=>{
    if(!currentClientCode || reposicaoCart.length===0) return;
    const msg = document.getElementById('cart-msg');
    const note = document.getElementById('cart-note').value.trim();
    const btn = document.getElementById('cart-submit-btn');
    btn.disabled = true; btn.textContent = 'Enviando…';

    await loadPartnerSnapshot(currentClientCode);
    const orderItems=[];
    for(const item of reposicaoCart){
      const p = PRODUCTS.find(p=>p.code===item.productCode);
      // aqui é só uma LEITURA do estoque atual, pra classificar o pedido — o desconto
      // de verdade só acontece quando o admin aprovar (é quando ele está autenticado)
      let type = 'reposicao';
      if(p && p.onDemand){
        type = 'producao';
      } else if(p && item.color){
        const c = (p.colors||[]).find(c=>c.name===item.color);
        const stock = c ? Number(c.stock) : 0;
        type = (c && item.qty <= stock) ? 'reposicao' : 'producao';
      }
      orderItems.push({productCode:item.productCode,color:item.color,qty:item.qty,type});
    }

    // O carrinho inteiro vira um único pedido; o banco gera apenas um número PED.
    const reqDraft={date:todayISO(),clientCode:currentClientCode,items:orderItems,note,status:'Pendente',type:orderItems.some(item=>item.type==='producao')?'producao':'reposicao'};
    const {data,error}=currentPartnerToken
      ? await supabaseClient.rpc('partner_add_pedido_secure',{p_access_token:currentPartnerToken,new_pedido:reqDraft})
      : {data:null,error:new Error('Sessão do parceiro expirada.')};
    const createdOrder=error?null:(data||reqDraft);
    if(error)console.error('Falha ao enviar pedido',error);

    const client = CLIENTS.find(c=>c.code===currentClientCode);
    const clientLabel = client ? `${client.name} (${client.code})` : currentClientCode;
    let text = `Pedido de reposição — ${clientLabel}\n\n`;
    if(createdOrder)text+=requestItemsText(createdOrder)+'\n';
    if(note) text += `\nObservação: ${note}`;
    const link = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

    msg.innerHTML = createdOrder
      ? `<div class="msg ok">Pedido enviado! Avise a HL 3D Solutions agora para agilizar:</div>
      <div style="margin:10px 0;"><a class="btn whatsapp" href="${link}" target="_blank" rel="noopener">Avisar no WhatsApp</a></div>`
      : `<div class="msg err">Não foi possível enviar o pedido agora. Tente novamente em instantes.</div>`;
    if(createdOrder){logPartnerActivity('order_sent','pedidos',0,{orderId:createdOrder.id||''});reposicaoCart=[];document.getElementById('cart-note').value='';}
    renderCart();
    renderConsignadoCatalog();
    await loadPartnerSnapshot(currentClientCode);
    renderClientRequests(currentClientCode);
    btn.disabled = false; btn.textContent = 'Enviar pedido de reposição';
  });

  document.getElementById('client-access-btn').addEventListener('click', async ()=>{
    const code = document.getElementById('client-code-input').value.trim().toUpperCase();
    const pin = document.getElementById('client-pin-input').value.trim();
    const msg = document.getElementById('client-gate-msg');
    msg.innerHTML='';
    if(!code||!/^\d{4,8}$/.test(pin)){msg.innerHTML='<div class="msg err">Informe seu código e o PIN de 4 a 8 números.</div>';return;}
    const btn=document.getElementById('client-access-btn');btn.disabled=true;btn.textContent='Verificando…';
    let result={ok:false};
    try{result=await unlockClient(code,pin);}catch(e){
      console.error('Falha no acesso do parceiro',e);
      const detail=String(e?.message||'');
      const needsSql=/encode|partner_login|function|schema|permission|42501|PGRST/i.test(detail);
      msg.innerHTML=needsSql
        ? '<div class="msg err">A função de acesso precisa ser atualizada. Execute novamente o arquivo de segurança corrigido no Supabase.</div>'
        : '<div class="msg err">Não foi possível verificar o acesso agora. Confira sua conexão e tente novamente.</div>';
    }
    btn.disabled=false;btn.textContent='Acessar minha conta';
    if(!result.ok){
      if(result.status==='activation_required'){
        document.getElementById('client-first-access-box').classList.add('open');
        document.getElementById('client-activation-input').focus();
        msg.innerHTML='<div class="msg err">Este cadastro ainda não foi ativado. Use o código descartável para criar seu PIN.</div>';
        return;
      }
      if(result.status==='locked'&&result.lockedUntil){showPartnerLock(result.lockedUntil);return;}
      if(!msg.innerHTML){const remaining=Number.isFinite(Number(result.attemptsRemaining))?Number(result.attemptsRemaining):null;msg.innerHTML=`<div class="msg err">Código ou PIN inválido.${remaining!==null?` Restam <strong>${remaining}</strong> tentativa${remaining===1?'':'s'} antes do bloqueio.`:' Após cinco tentativas, o acesso fica temporariamente bloqueado.'}</div>`;}
      return;
    }
    msg.innerHTML = '';
    document.getElementById('client-pin-input').value='';
    openClientDashboard(currentClientCode);
  });
  ['client-code-input','client-pin-input'].forEach(id=>document.getElementById(id).addEventListener('keydown',event=>{if(event.key==='Enter')document.getElementById('client-access-btn').click();}));
  document.getElementById('client-first-access-toggle').addEventListener('click',()=>{
    const box=document.getElementById('client-first-access-box'),open=!box.classList.contains('open');box.classList.toggle('open',open);
    document.getElementById('client-first-access-toggle').textContent=open?'Fechar primeiro acesso':'Primeiro acesso';
    if(open)document.getElementById('client-activation-input').focus();
  });
  document.getElementById('client-forgot-pin-link').href=`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Esqueci meu PIN de acesso à Área do Parceiro da Heitor Labs e preciso de um novo código de ativação.')}`;
  document.getElementById('client-activate-btn').addEventListener('click',async()=>{
    const code=document.getElementById('client-code-input').value.trim().toUpperCase(),activation=document.getElementById('client-activation-input').value.trim().toUpperCase();
    const pin=document.getElementById('client-new-pin-input').value.trim(),confirmation=document.getElementById('client-confirm-pin-input').value.trim(),msg=document.getElementById('client-activation-msg'),button=document.getElementById('client-activate-btn');
    msg.innerHTML='';
    if(!code){msg.innerHTML='<div class="msg err">Informe seu código de parceiro no campo acima.</div>';return;}
    if(!/^[A-F0-9]{8}$/.test(activation)){msg.innerHTML='<div class="msg err">Informe o código de ativação de 8 caracteres enviado pela HL.</div>';return;}
    if(!/^\d{4,8}$/.test(pin)){msg.innerHTML='<div class="msg err">O novo PIN deve conter de 4 a 8 números.</div>';return;}
    if(pin!==confirmation){msg.innerHTML='<div class="msg err">A confirmação do PIN não corresponde.</div>';return;}
    button.disabled=true;button.textContent='Criando PIN…';
    try{
      const result=await activatePartnerAccess(code,activation,pin);
      if(result?.status==='activated'){
        msg.innerHTML='<div class="msg ok">PIN criado com sucesso. Acessando sua área…</div>';
        const login=await unlockClient(code,pin);
        if(login.ok){document.getElementById('client-pin-input').value='';openClientDashboard(currentClientCode);return;}
      }else if(result?.status==='locked'&&result.lockedUntil){showPartnerLock(result.lockedUntil);msg.innerHTML='<div class="msg err">Muitas tentativas incorretas. Aguarde o desbloqueio para tentar novamente.</div>';}
      else if(result?.status==='expired')msg.innerHTML='<div class="msg err">Este código expirou. Solicite um novo código pelo WhatsApp.</div>';
      else if(result?.status==='unavailable')msg.innerHTML='<div class="msg err">Este código já foi utilizado ou não está mais disponível.</div>';
      else if(result?.status==='invalid_pin')msg.innerHTML='<div class="msg err">Escolha um PIN contendo de 4 a 8 números.</div>';
      else {const remaining=Number(result?.attemptsRemaining);msg.innerHTML=`<div class="msg err">Código de ativação inválido.${Number.isFinite(remaining)?` Restam <strong>${remaining}</strong> tentativa${remaining===1?'':'s'}.`:''}</div>`;}
    }catch(error){msg.innerHTML=`<div class="msg err">${isMissingSecurityFunction(error)?'Execute a atualização de primeiro acesso no Supabase.':'Não foi possível ativar o acesso agora. Tente novamente.'}</div>`;}
    finally{button.disabled=false;button.textContent='Criar PIN e acessar';}
  });
  function doClientLogout(){
    clearInterval(partnerLockTimer);setPartnerAccessDisabled(false);
    stopPartnerActivity();
    lockClient();
    document.getElementById('client-dashboard').style.display = 'none';
    document.getElementById('client-gate').style.display = 'block';
    document.getElementById('client-code-input').value = '';
    document.getElementById('client-pin-input').value = '';
    partnerTourAutoOffered=false;
  }
  document.getElementById('client-logout-btn').addEventListener('click', doClientLogout);
  document.getElementById('client-history-toggle').addEventListener('click', ()=>{
    const hist = document.getElementById('client-history');
    const arrow = document.getElementById('client-history-arrow');
    const isOpen = hist.style.display === 'block';
    hist.style.display = isOpen ? 'none' : 'block';
    arrow.textContent = isOpen ? '▸ ver' : '▾ esconder';
  });
  document.getElementById('client-logout-top-btn').addEventListener('click', doClientLogout);
  document.getElementById('partner-help-btn').addEventListener('click',()=>openPartnerTour(true));
  document.getElementById('partner-period').addEventListener('click',event=>{
    const btn=event.target.closest('button[data-months]');if(!btn||!currentClientCode)return;
    document.querySelectorAll('#partner-period button').forEach(b=>b.classList.toggle('active',b===btn));renderPartnerPeriod(currentClientCode,Number(btn.dataset.months));
  });
  document.getElementById('partner-sale-toggle').addEventListener('click',()=>{
    document.getElementById('partner-sale-form').classList.add('open');document.getElementById('partner-sale-product').focus();
  });
  document.getElementById('partner-sale-cancel').addEventListener('click',()=>document.getElementById('partner-sale-form').classList.remove('open'));
  document.getElementById('partner-sale-product').addEventListener('change',event=>{
    const opt=event.target.selectedOptions[0],color=opt?.dataset.color||'';
    document.getElementById('partner-sale-color').innerHTML=`<option value="${escapeHtml(color)}">${escapeHtml(color||'Sem cor')}</option>`;
  });
  document.getElementById('partner-sale-submit').addEventListener('click',async()=>{
    const select=document.getElementById('partner-sale-product'),opt=select.selectedOptions[0],productCode=select.value,color=opt?.dataset.color||'',qty=Math.floor(Number(document.getElementById('partner-sale-qty').value)),date=document.getElementById('partner-sale-date').value,note=document.getElementById('partner-sale-note').value.trim(),msg=document.getElementById('partner-sale-msg'),btn=document.getElementById('partner-sale-submit');
    const available=clientStats(currentClientCode).products.find(r=>r.code===productCode&&(r.color||'')===color)?.saldo||0;
    if(!productCode||!date||qty<1){msg.innerHTML='<div class="msg err">Selecione o produto, a data e uma quantidade válida.</div>';return;}
    if(qty>available){msg.innerHTML=`<div class="msg err">Você possui ${available} unidade(s) dessa variação.</div>`;return;}
    btn.disabled=true;btn.textContent='Enviando…';msg.innerHTML='';
    try{await submitPartnerAction('sale_report',{productCode,color,qty,date,note});msg.innerHTML='<div class="msg ok">Venda enviada para conferência da HL. Ela será incluída no saldo após a aprovação.</div>';document.getElementById('partner-sale-qty').value=1;document.getElementById('partner-sale-note').value='';logPartnerActivity('sale_report','resumo',0,{productCode,qty});renderPartnerCenter(currentClientCode);}
    catch(error){msg.innerHTML=`<div class="msg err">${isMissingSecurityFunction(error)?'Execute o SQL atualizado do Pacote 5 no Supabase.':'Não foi possível enviar agora. Tente novamente.'}</div>`;}
    finally{btn.disabled=false;btn.textContent='Enviar para conferência';}
  });
  document.getElementById('partner-download-docs').addEventListener('click',async()=>{
    const docs=DOCUMENTS.filter(d=>d.clientCode===currentClientCode);if(!docs.length){alert('Não há documentos disponíveis.');return;}
    if(!confirm(`Baixar ${docs.length} documento(s)? O navegador poderá solicitar autorização para vários downloads.`))return;
    for(let i=0;i<docs.length;i++){await openDocument(docs[i]);await new Promise(resolve=>setTimeout(resolve,350));}
    logPartnerActivity('documents_download','documentos',0,{count:docs.length});
  });
  document.getElementById('partner-tour-close').addEventListener('click',closePartnerTour);
  document.getElementById('partner-tour-prev').addEventListener('click',()=>{if(partnerTourStep>0){partnerTourStep--;renderPartnerTourStep();}});
  document.getElementById('partner-tour-next').addEventListener('click',()=>{
    if(partnerTourStep<PARTNER_TOUR_STEPS.length-1){partnerTourStep++;renderPartnerTourStep();return;}
    savePartnerTourPreference();logPartnerActivity('tutorial_complete','resumo');closePartnerTour();
  });
  document.getElementById('partner-tour-location').addEventListener('click',showPartnerTourLocation);
  document.getElementById('partner-tour-overlay').addEventListener('click',event=>{if(event.target===event.currentTarget)closePartnerTour();});
  document.addEventListener('keydown',event=>{
    const overlay=document.getElementById('partner-tour-overlay');if(!overlay.classList.contains('open'))return;
    if(event.key==='Escape'){closePartnerTour();return;}
    if(event.key==='ArrowRight'){document.getElementById('partner-tour-next').click();return;}
    if(event.key==='ArrowLeft'&&partnerTourStep>0){document.getElementById('partner-tour-prev').click();return;}
    if(event.key==='Tab'){
      const focusable=[...document.querySelectorAll('#partner-tour-dialog button:not([disabled]),#partner-tour-dialog input:not([disabled])')].filter(el=>el.offsetParent!==null);
      if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });

  function renderClientRequests(code){
    const mine = PEDIDOS.filter(r=>r.clientCode===code).slice().reverse();
    const statusClass = { Pendente:'pendente', Aprovado:'aprovado', Recusado:'recusado' };
    document.getElementById('client-requests').innerHTML = mine.length ? mine.map(r=>`
      <div class="ticket">
        <div class="left">
          <div class="desc">${requestItemsHtml(r)}${r.note ? '<br><small>Observação: '+escapeHtml(r.note)+'</small>' : ''}</div>
          <div class="id">${r.id} · ${fmtDate(r.date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${requestHasProduction(r) ? '<span class="badge acerto">Inclui produção</span>' : ''}
          ${r.status==='Pendente' ? whatsappBtn(r) : ''}
          <span class="badge ${statusClass[r.status]}">${r.status}</span>
        </div>
      </div>`).join('') : `<div class="empty"><div class="glyph">◇</div>Você ainda não fez nenhum pedido.</div>`;
  }

  // ---------- ADMIN GATE (autenticação real via Supabase Auth) ----------
  async function checkAdminSessionAndShow(){
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session){
      document.getElementById('admin-gate').style.display = 'none';
      document.getElementById('admin-dashboard').style.display = 'block';
      await refreshData();
      await ensureHistoricalPriceSnapshots();
      refreshAdminSelects();
      renderAdminLists();
    } else {
      document.getElementById('admin-gate').style.display = 'block';
      document.getElementById('admin-dashboard').style.display = 'none';
    }
  }
  document.getElementById('admin-access-btn').addEventListener('click', async ()=>{
    const pass = document.getElementById('admin-pass-input').value;
    const msg = document.getElementById('admin-gate-msg');
    const btn = document.getElementById('admin-access-btn');
    if(!pass){ msg.innerHTML = '<div class="msg err">Digite a senha.</div>'; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await supabaseClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pass });
    btn.disabled = false; btn.textContent = 'Entrar';
    if(error){
      msg.innerHTML = '<div class="msg err">Senha incorreta.</div>';
      return;
    }
    msg.innerHTML = '';
    document.getElementById('admin-pass-input').value = '';
    document.getElementById('admin-gate').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    await refreshData();
    await ensureHistoricalPriceSnapshots();
    refreshAdminSelects();
    renderAdminLists();
  });
  document.getElementById('admin-pass-input').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter') document.getElementById('admin-access-btn').click();
  });
  document.getElementById('admin-logout-btn').addEventListener('click', async ()=>{
    await supabaseClient.auth.signOut();
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('admin-gate').style.display = 'block';
    document.getElementById('admin-pass-input').value = '';
  });

  const ADMIN_SECTIONS={
    produtos:{group:'Catálogo',title:'Produtos',description:'Cadastre, organize e publique os produtos exibidos no catálogo.'},
    estoque:{group:'Catálogo',title:'Estoque rápido',description:'Atualize quantidades, custos, margens e preços sem abrir o cadastro completo.'},
    qualidade:{group:'Catálogo',title:'Qualidade',description:'Identifique cadastros incompletos e abra rapidamente os produtos que precisam de atenção.'},
    midia:{group:'Catálogo',title:'Mídia',description:'Localize imagens, confira seus vínculos e remova arquivos não utilizados.'},
    clientes:{group:'Parceiros',title:'Clientes',description:'Consulte e mantenha os dados dos parceiros de consignação.'},
    entregas:{group:'Parceiros',title:'Lançar entrega',description:'Registre uma nova remessa de produtos enviada ao parceiro.'},
    devolucoes:{group:'Parceiros',title:'Lançar devolução',description:'Registre os itens devolvidos e atualize o estoque quando necessário.'},
    acertos:{group:'Financeiro',title:'Lançar acerto',description:'Registre vendas informadas pelo parceiro e a situação do pagamento.'},
    'venda-direta':{group:'Financeiro',title:'Venda direta',description:'Registre compras avulsas pagas pelo parceiro fora do estoque consignado.'},
    pedidos:{group:'Pedidos',title:'Reposição',description:'Analise e aprove os pedidos de reposição enviados pelos parceiros.'},
    'vendas-parceiros':{group:'Pedidos',title:'Vendas informadas',description:'Confira e aprove as vendas comunicadas diretamente pelos parceiros.'},
    relatorio:{group:'Gestão',title:'Relatório',description:'Consolide saldos, vendas e valores por parceiro.'},
    documentos:{group:'Gestão',title:'Documentos',description:'Envie contratos e comprovantes para a área individual dos parceiros.'}
  };
  const adminDrawer=document.getElementById('admin-drawer'),adminDrawerBackdrop=document.getElementById('admin-drawer-backdrop');
  function setAdminDrawer(open){adminDrawer?.classList.toggle('open',open);adminDrawerBackdrop?.classList.toggle('open',open);adminDrawer?.setAttribute('aria-hidden',String(!open));adminDrawerBackdrop?.setAttribute('aria-hidden',String(!open));if(open)document.getElementById('admin-drawer-close')?.focus();}
  function buildAdminDrawer(){
    const list=document.getElementById('admin-drawer-list');if(!list)return;list.innerHTML=Object.entries(ADMIN_SECTIONS).map(([id,meta])=>`<button type="button" data-drawer-tab="${id}"><small>${meta.group}</small><br>${meta.title}</button>`).join('');
    list.querySelectorAll('[data-drawer-tab]').forEach(button=>button.addEventListener('click',()=>{switchAdminTab(button.dataset.drawerTab);setAdminDrawer(false);}));
  }
  buildAdminDrawer();document.getElementById('admin-drawer-open')?.addEventListener('click',()=>setAdminDrawer(true));document.getElementById('admin-drawer-close')?.addEventListener('click',()=>setAdminDrawer(false));adminDrawerBackdrop?.addEventListener('click',()=>setAdminDrawer(false));document.addEventListener('keydown',event=>{if(event.key==='Escape')setAdminDrawer(false);});
  async function switchAdminTab(tab,refresh=true,scroll=true){
    const meta=ADMIN_SECTIONS[tab];if(!meta)return;
    const productPanel=root.querySelector('.admin-tab[data-tab="produtos"]');
    if(tab!=='produtos'&&productPanel?.style.display!=='none'&&productFormDirty){
      saveProductDraft();
      if(!confirm('Há alterações não salvas no cadastro de produto. Elas ficarão guardadas como rascunho. Deseja sair desta área?'))return;
      productFormDirty=false;
    }
    root.querySelectorAll('[data-admin-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.adminTab===tab));
    root.querySelectorAll('.admin-tab').forEach(panel=>panel.style.display=panel.dataset.tab===tab?'block':'none');
    document.getElementById('admin-section-select').value=tab;
    document.getElementById('admin-section-group').textContent=meta.group;
    document.getElementById('admin-section-title').textContent=meta.title;
    document.getElementById('admin-section-description').textContent=meta.description;
    document.querySelectorAll('[data-drawer-tab]').forEach(button=>button.classList.toggle('active',button.dataset.drawerTab===tab));
    const openButton=document.getElementById('admin-drawer-open');if(openButton)openButton.querySelector('span').textContent=`${meta.group} · ${meta.title}`;
    const mode=document.getElementById('admin-mode-chip');if(mode)mode.textContent=['relatorio','qualidade','midia','documentos'].includes(tab)?'Consulta':'Cadastro';
    if(refresh){await refreshData();refreshAdminSelects();renderAdminLists();}
    if(tab==='qualidade')renderQualityPanel();
    if(tab==='estoque')renderStockCenter();
    if(tab==='midia')await loadMediaLibrary();
    if(scroll)document.querySelector('.admin-section-context').scrollIntoView({behavior:'smooth',block:'start'});
  }
  root.querySelectorAll('[data-admin-tab]').forEach(btn=>btn.addEventListener('click',()=>switchAdminTab(btn.dataset.adminTab)));
  document.getElementById('admin-section-select').addEventListener('change',e=>switchAdminTab(e.target.value));

  const ADMIN_MENU_COLLAPSED_KEY='hl_admin_menu_collapsed';
  function applyAdminMenuMode(collapsed){
    const workspace=document.querySelector('.admin-workspace');
    const button=document.getElementById('admin-menu-toggle-btn');
    if(!workspace||!button)return;
    workspace.classList.toggle('menu-collapsed',collapsed);
    button.textContent=collapsed?'Usar menu lateral':'Recolher menu';
    button.setAttribute('aria-expanded',String(!collapsed));
    button.title=collapsed?'Exibir o menu completo na lateral':'Ocultar o menu lateral e ampliar a área de trabalho';
  }
  let adminMenuCollapsed=true;
  try{
    const savedAdminMenu=localStorage.getItem(ADMIN_MENU_COLLAPSED_KEY);
    adminMenuCollapsed=savedAdminMenu===null?true:savedAdminMenu==='true';
  }catch(e){}
  applyAdminMenuMode(adminMenuCollapsed);
  document.getElementById('admin-menu-toggle-btn').addEventListener('click',()=>{
    adminMenuCollapsed=!document.querySelector('.admin-workspace').classList.contains('menu-collapsed');
    applyAdminMenuMode(adminMenuCollapsed);
    try{localStorage.setItem(ADMIN_MENU_COLLAPSED_KEY,String(adminMenuCollapsed));}catch(e){}
  });
  document.getElementById('req-refresh-btn').addEventListener('click', async ()=>{
    const btn = document.getElementById('req-refresh-btn');
    btn.disabled = true; btn.textContent = 'Atualizando…';
    await refreshData();
    refreshAdminSelects();
    renderAdminLists();
    btn.disabled = false; btn.textContent = '↻ Atualizar';
  });
  document.getElementById('partner-sales-refresh-btn').addEventListener('click',async()=>{
    const btn=document.getElementById('partner-sales-refresh-btn');btn.disabled=true;btn.textContent='Atualizando…';
    try{await refreshData();refreshAdminSelects();renderAdminLists();}finally{btn.disabled=false;btn.textContent='↻ Atualizar';}
  });

  let entregaProductCategory='';
  let entregaProductSearch='';

  function renderEntregaProductPreview(product){
    const preview=document.getElementById('e-product-preview');if(!preview)return;
    if(!product){preview.innerHTML='<div class="delivery-product-preview-image">Nenhum produto selecionado</div>';return;}
    const categories=getCategories(product).join(' · ')||'Sem categoria';
    const colors=(product.colors||[]).map(color=>color.name).join(', ');
    const image=String(product.image||'').replace(/'/g,'%27');
    preview.innerHTML=`<div class="delivery-product-preview-image" style="${image?`background-image:url('${image}')`:''}">${image?'':'Sem foto'}</div><h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.code)} · ${escapeHtml(categories)}</p><p style="margin-top:5px;color:var(--teal);font-weight:700;">Repasse: ${fmtMoney(product.price)}</p>${colors?`<p style="margin-top:5px;">Cores: ${escapeHtml(colors)}</p>`:''}`;
  }

  function renderEntregaProductBrowser(){
    const categorySelect=document.getElementById('e-product-category'),results=document.getElementById('e-product-results'),productSelect=document.getElementById('e-product');
    if(!categorySelect||!results||!productSelect)return;
    const available=PRODUCTS.filter(product=>product.active!==false&&isConsignmentAvailable(product));
    const categories=[...new Set(available.flatMap(getCategories))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const previousCategory=entregaProductCategory;
    categorySelect.innerHTML='<option value="">Todas as categorias</option>'+categories.map(category=>`<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    if(categories.includes(previousCategory))categorySelect.value=previousCategory;else entregaProductCategory='';
    const query=normalizeSearch(entregaProductSearch);
    const filtered=available.filter(product=>(!entregaProductCategory||getCategories(product).includes(entregaProductCategory))&&(!query||matchesSearch(product,query)));
    if(!filtered.length){results.innerHTML='<div class="empty" style="padding:20px;">Nenhum produto encontrado com estes filtros.</div>';renderEntregaProductPreview(null);return;}
    results.innerHTML=filtered.map(product=>{
      const image=String(product.image||'').replace(/'/g,'%27');
      return `<button type="button" class="delivery-product-option ${product.code===productSelect.value?'selected':''}" data-entrega-product="${escapeHtml(product.code)}"><span class="delivery-product-thumb" style="${image?`background-image:url('${image}')`:''}">${image?'':'Sem foto'}</span><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.code)} · ${escapeHtml(getCategories(product).join(', ')||'Sem categoria')}</small></span><span class="mono">${fmtMoney(product.price)}</span></button>`;
    }).join('');
    results.querySelectorAll('[data-entrega-product]').forEach(button=>{
      const product=PRODUCTS.find(item=>item.code===button.dataset.entregaProduct);
      button.addEventListener('mouseenter',()=>renderEntregaProductPreview(product));
      button.addEventListener('focus',()=>renderEntregaProductPreview(product));
      button.addEventListener('click',()=>{productSelect.value=product.code;updateColorSelect('e-product','e-color');renderEntregaProductPreview(product);results.querySelectorAll('.delivery-product-option').forEach(item=>item.classList.toggle('selected',item===button));});
    });
    renderEntregaProductPreview(PRODUCTS.find(product=>product.code===productSelect.value)||filtered[0]);
  }

  function refreshAdminSelects(){
    const clientOpts = CLIENTS.map(c=>`<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');
    const productOpts = PRODUCTS.map(p=>`<option value="${escapeHtml(p.code)}">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</option>`).join('');
    const consignmentProductOpts = PRODUCTS.filter(isConsignmentAvailable).map(p=>`<option value="${escapeHtml(p.code)}">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</option>`).join('');
    ['e-client','d-client','a-client','v-client'].forEach(id=>document.getElementById(id).innerHTML = clientOpts || '<option value="">Cadastre um cliente primeiro</option>');
    document.getElementById('rep-client').innerHTML = clientOpts || '<option value="">Cadastre um cliente primeiro</option>';
    document.getElementById('doc-client').innerHTML = clientOpts || '<option value="">Cadastre um cliente primeiro</option>';
    document.getElementById('e-product').innerHTML = consignmentProductOpts || '<option value="">Nenhum produto disponível para consignação</option>';
    ['d-product','a-product','v-product'].forEach(id=>document.getElementById(id).innerHTML = productOpts || '<option value="">Cadastre um produto primeiro</option>');
    document.getElementById('e-date').value = todayISO();
    document.getElementById('d-date').value = todayISO();
    document.getElementById('a-date').value = todayISO();
    document.getElementById('v-date').value = todayISO();
    updateColorSelect('e-product','e-color');
    updateColorSelect('d-product','d-color');
    updateColorSelect('a-product','a-color');
    updateColorSelect('v-product','v-color');
    renderEntregaProductBrowser();
    renderCategoryPicker();
    const bulkCategorySelect = document.getElementById('bulk-category');
    if(bulkCategorySelect){
      const currentVal = bulkCategorySelect.value;
      bulkCategorySelect.innerHTML = '<option value="">Todos os produtos</option>' + KNOWN_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      bulkCategorySelect.value = currentVal;
    }
    const templateSelect=document.getElementById('p-template-product');
    if(templateSelect){
      const currentTemplate=templateSelect.value;
      templateSelect.innerHTML='<option value="">Usar outro produto como modelo...</option>'+productOpts;
      templateSelect.value=currentTemplate;
    }
    const selectedCalculation=document.getElementById('p-cost-calculation')?.value||'';
    renderCostCalculationOptions(selectedCalculation);
    updateNewClientCode();
  }

  function updateColorSelect(productSelectId, colorSelectId, opts){
    opts = opts || {};
    const code = document.getElementById(productSelectId).value;
    const p = PRODUCTS.find(p=>p.code===code);
    const colors = (p && p.colors) || [];
    const sel = document.getElementById(colorSelectId);
    if(colors.length === 0){
      sel.innerHTML = '<option value="">— sem variação de cor —</option>';
      return;
    }
    sel.innerHTML = colors.map(c=>{
      const stockLabel = opts.showStock ? ` (${c.stock} em estoque)` : '';
      return `<option value="${c.name}">${c.name}${stockLabel}</option>`;
    }).join('');
  }
  ['e-product','d-product','a-product','v-product'].forEach(id=>{
    document.getElementById(id).addEventListener('change', ()=>{
      updateColorSelect(id, id.replace('-product','-color'));
      if(id==='e-product'){renderEntregaProductPreview(PRODUCTS.find(product=>product.code===document.getElementById('e-product').value));renderEntregaProductBrowser();}
    });
  });
  document.getElementById('e-product-category').addEventListener('change',event=>{entregaProductCategory=event.target.value;renderEntregaProductBrowser();});
  document.getElementById('e-product-search').addEventListener('input',event=>{entregaProductSearch=event.target.value.trim();renderEntregaProductBrowser();});

  let expandedProductCode = null;
  let editingColorKey = null; // formato "CODIGO_PRODUTO|NOME_DA_COR"
  let adminProductSearch = '';
  let adminProductStatus = 'active';
  let adminProductSort = 'name';
  let currentProductStep = 0;
  const PRODUCT_DRAFT_KEY='hl_product_form_draft_v1';
  let productFormDirty=false;
  let productDraftTimer=null;

  function updateDescriptionCounter(){
    const field=document.getElementById('p-desc'),counter=document.getElementById('p-desc-counter');
    if(field&&counter)counter.textContent=`${field.value.length}/1200`;
  }
  function captureProductDraft(){
    const ids=['p-code','p-prefix','p-name','p-public-price','p-price','p-promo-price','p-img','p-video','p-desc','p-first-color-name','p-first-color-stock','p-first-color-price','p-first-color-promo','p-first-color-img','p-customizable-minqty','p-cost-calculation'];
    const values={};ids.forEach(id=>{values[id]=document.getElementById(id)?.value||'';});
    return {values,categories:[...pendingCategories],gallery:[...pendingGallery],colors:pendingColors.map(color=>({...color})),onDemand:document.getElementById('p-ondemand').checked,customizable:document.getElementById('p-customizable').checked,noConsignment:document.getElementById('p-no-consignment').checked,videoSound:document.getElementById('p-video-sound').checked,active:document.getElementById('p-active').checked,editingProductCode,step:currentProductStep,savedAt:Date.now()};
  }
  function updateDraftNotice(){
    const notice=document.getElementById('p-draft-notice');if(!notice)return;
    let draft=null;try{draft=JSON.parse(localStorage.getItem(PRODUCT_DRAFT_KEY)||'null');}catch(e){}
    notice.classList.toggle('show',!!draft);
    if(draft?.savedAt)document.getElementById('p-draft-text').textContent=`Rascunho salvo neste aparelho em ${new Date(draft.savedAt).toLocaleString('pt-BR')}.`;
  }
  function saveProductDraft(){
    if(!productFormDirty)return;
    try{localStorage.setItem(PRODUCT_DRAFT_KEY,JSON.stringify(captureProductDraft()));updateDraftNotice();document.getElementById('p-form-status').textContent='Rascunho salvo';}catch(e){}
  }
  function markProductDirty(){
    productFormDirty=true;clearTimeout(productDraftTimer);productDraftTimer=setTimeout(saveProductDraft,450);
  }
  function clearProductDraft(){
    clearTimeout(productDraftTimer);productFormDirty=false;try{localStorage.removeItem(PRODUCT_DRAFT_KEY);}catch(e){}updateDraftNotice();
  }
  function restoreProductDraft(){
    let draft=null;try{draft=JSON.parse(localStorage.getItem(PRODUCT_DRAFT_KEY)||'null');}catch(e){}
    if(!draft)return;
    Object.entries(draft.values||{}).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=value;});
    pendingCategories=Array.isArray(draft.categories)?draft.categories:[];pendingGallery=Array.isArray(draft.gallery)?draft.gallery:[];pendingColors=Array.isArray(draft.colors)?draft.colors:[];
    document.getElementById('p-ondemand').checked=!!draft.onDemand;document.getElementById('p-customizable').checked=!!draft.customizable;document.getElementById('p-no-consignment').checked=!!draft.noConsignment;document.getElementById('p-video-sound').checked=!!draft.videoSound;document.getElementById('p-active').checked=draft.active!==false;
    updateConsignmentFieldState();
    document.getElementById('p-customizable-minqty-wrap').style.display=draft.customizable?'flex':'none';
    editingProductCode=draft.editingProductCode&&PRODUCTS.some(p=>p.code===draft.editingProductCode)?draft.editingProductCode:null;
    document.getElementById('p-first-color-wrap').style.display='block';
    document.getElementById('p-edit-colors-wrap').style.display=editingProductCode?'block':'none';
    document.getElementById('p-form-add-color-btn').style.display=editingProductCode?'inline-flex':'none';
    document.getElementById('p-color-form-title').textContent=editingProductCode?'Adicionar nova cor':'Primeira variação';
    document.getElementById('p-color-form-help').textContent=editingProductCode?'Cadastre uma nova cor e o estoque inicial deste produto.':'Depois de salvar, você poderá acrescentar outras cores e fotografias no catálogo administrativo.';
    document.getElementById('p-add-btn').textContent=editingProductCode?'Salvar alterações':'Adicionar produto';
    document.getElementById('p-cancel-edit-btn').style.display=editingProductCode?'inline-block':'none';
    document.getElementById('p-form-title').textContent=editingProductCode?`Continuando edição: ${editingProductCode}`:'Novo produto — rascunho restaurado';
    renderCategoryPicker();renderPendingGallery();renderProductFormColors();updateProductPricePreview();updateProductImagePreview();updateDescriptionCounter();showProductStep(draft.step||0);productFormDirty=true;
  }

  function adminProductStock(p){
    if(p.onDemand) return Number.MAX_SAFE_INTEGER;
    return (p.colors||[]).reduce((sum,color)=>sum+(Number(color.stock)||0),0);
  }
  function filteredAdminProducts(){
    const query=adminProductSearch.toLowerCase();
    let list=PRODUCTS.filter(p=>{
      const statusMatch=adminProductStatus==='all'||(adminProductStatus==='active'&&p.active!==false)||(adminProductStatus==='archived'&&p.active===false)||(adminProductStatus==='no-image'&&!p.image);
      const text=[p.code,p.name,...getCategories(p)].join(' ').toLowerCase();
      return statusMatch&&(!query||text.includes(query));
    });
    list=list.slice().sort((a,b)=>{
      if(adminProductSort==='code')return String(a.code).localeCompare(String(b.code),'pt-BR');
      if(adminProductSort==='price-asc')return Number(a.publicPrice||0)-Number(b.publicPrice||0);
      if(adminProductSort==='price-desc')return Number(b.publicPrice||0)-Number(a.publicPrice||0);
      if(adminProductSort==='stock-asc')return adminProductStock(a)-adminProductStock(b);
      if(adminProductSort==='recent')return Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0);
      return String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
    });
    return list;
  }

  function calcProductName(calc){
    return calc?.inputs?.['calc-product-name'] || calc?.id || 'Cálculo sem nome';
  }
  function calcUnitCost(calc){
    const qty=Math.max(1,Number(calc?.result?.qtyPieces)||1);
    return (Number(calc?.result?.custosTotal)||0)/qty;
  }
  function calculationById(id){
    return CALCULATIONS.find(calc=>calc.id===id);
  }
  function productCostLink(code){
    return PRODUCT_COST_LINKS.find(link=>link.productCode===code);
  }
  function productQualityAudit(product){
    const checks=[];
    const add=(ok,weight,label,critical=false)=>checks.push({ok,weight,label,critical});
    const publicPrice=Number(product.publicPrice),consigPrice=Number(product.price),description=String(product.description||'').replace(/\s+/g,' ').trim();
    const costLink=productCostLink(product.code),linkedCalculation=costLink&&calculationById(costLink.calculationId);
    const costStale=!!(linkedCalculation&&String(costLink.calculationUpdatedAt||'')!==String(linkedCalculation.updatedAt||linkedCalculation.createdAt||''));
    const colors=product.colors||[],allOut=colors.length>0&&colors.every(color=>(Number(color.stock)||0)<=0);
    add(!!String(product.code||'').trim()&&!!String(product.name||'').trim(),10,'Código ou nome incompleto',true);
    add(Number.isFinite(publicPrice)&&publicPrice>0,15,'Preço público ausente',true);
    add(!isConsignmentAvailable(product)||(Number.isFinite(consigPrice)&&consigPrice>=0&&(!Number.isFinite(publicPrice)||consigPrice<=publicPrice)),10,'Repasse inválido',true);
    add(!!product.image,20,'Sem imagem principal',true);
    add(description.length>=30,15,'Descrição muito curta',true);
    add(getCategories(product).length>0,10,'Sem categoria',true);
    add(!allOut,5,'Todas as variações estão sem estoque');
    const hasDirectCost=Number.isFinite(Number(PRODUCT_DIRECT_COSTS[product.code]))&&Number(PRODUCT_DIRECT_COSTS[product.code])>=0;
    add(hasDirectCost||(!!linkedCalculation&&!costStale),10,linkedCalculation?'Cálculo de custo desatualizado':'Sem custo informado');
    add(!!product.image&&(product.gallery||[]).length>0,5,'Adicione outra fotografia');
    const score=checks.reduce((sum,check)=>sum+(check.ok?check.weight:0),0),issues=checks.filter(check=>!check.ok);
    return {product,score,issues,criticalIssues:issues.filter(issue=>issue.critical),hasCost:hasDirectCost||(!!linkedCalculation&&!costStale)};
  }
  function renderQualityPanel(){
    const summary=document.getElementById('quality-summary'),list=document.getElementById('quality-list');if(!summary||!list)return;
    const audits=PRODUCTS.map(productQualityAudit),average=audits.length?Math.round(audits.reduce((sum,audit)=>sum+audit.score,0)/audits.length):0;
    const complete=audits.filter(audit=>audit.issues.length===0).length,critical=audits.filter(audit=>audit.criticalIssues.length>0).length,noCost=audits.filter(audit=>!audit.hasCost).length;
    summary.innerHTML=`<div class="quality-summary-card"><small>Média do catálogo</small><strong>${average}%</strong></div><div class="quality-summary-card"><small>Cadastros completos</small><strong>${complete}</strong></div><div class="quality-summary-card"><small>Problemas críticos</small><strong>${critical}</strong></div><div class="quality-summary-card"><small>Sem custo atualizado</small><strong>${noCost}</strong></div>`;
    const query=qualitySearch.toLowerCase();
    const filtered=audits.filter(audit=>{
      const statusMatch=qualityStatus==='all'||(qualityStatus==='attention'&&audit.issues.length>0)||(qualityStatus==='critical'&&audit.criticalIssues.length>0)||(qualityStatus==='ready'&&audit.issues.length===0)||(qualityStatus==='no-image'&&!audit.product.image)||(qualityStatus==='no-cost'&&!audit.hasCost);
      return statusMatch&&(!query||`${audit.product.code} ${audit.product.name}`.toLowerCase().includes(query));
    }).sort((a,b)=>{
      if(qualitySort==='name')return String(a.product.name||'').localeCompare(String(b.product.name||''),'pt-BR');
      if(qualitySort==='recent')return Number(b.product.updatedAt||b.product.createdAt||0)-Number(a.product.updatedAt||a.product.createdAt||0);
      return a.score-b.score||String(a.product.name||'').localeCompare(String(b.product.name||''),'pt-BR');
    });
    if(!filtered.length){list.innerHTML='<div class="empty"><div class="glyph">✓</div>Nenhum produto encontrado neste filtro.</div>';return;}
    list.innerHTML=filtered.map(audit=>{
      const product=audit.product,scoreClass=audit.score===100?'aprovado':audit.criticalIssues.length?'recusado':'pendente';
      return `<div class="quality-card"><div class="quality-thumb" style="${product.image?`background-image:url('${String(product.image).replace(/'/g,'%27')}')`:''}">${product.image?'':'sem foto'}</div><div><div class="quality-title-row"><strong>${escapeHtml(product.name||'Produto sem nome')}</strong><span class="quality-code">${escapeHtml(product.code||'sem código')}</span><span class="badge ${scoreClass}">${audit.score}%</span>${product.active===false?'<span class="badge pendente">Arquivado</span>':''}</div><div class="quality-meter"><div class="quality-track"><span style="width:${audit.score}%"></span></div><span class="quality-score">${audit.score}/100</span></div>${audit.issues.length?`<div class="quality-issues">${audit.issues.map(issue=>`<span class="quality-issue ${issue.critical?'critical':''}">${issue.critical?'! ':''}${escapeHtml(issue.label)}</span>`).join('')}</div>`:'<div class="quality-ok">Cadastro completo e pronto para publicação.</div>'}</div><button type="button" class="btn secondary" data-quality-edit="${escapeHtml(product.code)}">${audit.issues.length?'Corrigir cadastro':'Abrir cadastro'}</button></div>`;
    }).join('');
    list.querySelectorAll('[data-quality-edit]').forEach(button=>button.addEventListener('click',()=>openAdminProductEditor(button.dataset.qualityEdit)));
  }
  async function openAdminProductEditor(code){
    await switchAdminTab('produtos',false);
    adminProductSearch=code;adminProductStatus='all';document.getElementById('admin-product-search').value=code;document.getElementById('admin-product-status').value='all';renderAdminLists();
    const editButton=[...document.querySelectorAll('[data-edit-product]')].find(item=>item.dataset.editProduct===code);if(editButton)editButton.click();
  }
  document.getElementById('quality-search').addEventListener('input',event=>{qualitySearch=event.target.value.trim();renderQualityPanel();});
  document.getElementById('quality-status').addEventListener('change',event=>{qualityStatus=event.target.value;renderQualityPanel();});
  document.getElementById('quality-sort').addEventListener('change',event=>{qualitySort=event.target.value;renderQualityPanel();});
  function selectedCostCalculation(){
    const select=document.getElementById('p-cost-calculation');
    return select ? calculationById(select.value) : null;
  }
  function renderCostCalculationOptions(selectedId){
    const select=document.getElementById('p-cost-calculation');
    if(!select)return;
    const sorted=CALCULATIONS.slice().sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
    select.innerHTML='<option value="">— Não vincular cálculo —</option>'+sorted.map(calc=>{
      const cost=calcUnitCost(calc),suggested=Number(calc?.result?.precoPorPeca)||0;
      return `<option value="${escapeHtml(calc.id)}">${escapeHtml(calcProductName(calc))} · custo ${fmtMoney(cost)} · sugerido ${fmtMoney(suggested)}</option>`;
    }).join('');
    select.value=selectedId&&sorted.some(calc=>calc.id===selectedId)?selectedId:'';
    renderSelectedCostCalculation();
  }
  function renderSelectedCostCalculation(){
    const calc=selectedCostCalculation();
    const box=document.getElementById('p-cost-calculation-summary');
    const useBtn=document.getElementById('p-use-calculated-price-btn');
    if(!box||!useBtn)return;
    if(!calc){
      box.textContent=CALCULATIONS.length
        ? 'Selecione um cálculo salvo para acompanhar custo, material, máquina e atualização.'
        : 'Nenhum cálculo salvo foi encontrado. Salve um cálculo no portal de ferramentas e clique em “Atualizar cálculos”.';
      useBtn.style.display='none';
      updateProductPricePreview();
      return;
    }
    const cost=calcUnitCost(calc);
    const material=calc?.rates?.material?.name||'Não informado';
    const machine=calc?.rates?.equip?.name||'Não informada';
    const grams=Number(calc?.inputs?.['calc-material-qty'])||0;
    const hours=Number(calc?.inputs?.['calc-equip-hours'])||0;
    const updatedRaw=calc.updatedAt||calc.createdAt;
    const updated=updatedRaw&&!isNaN(new Date(updatedRaw).getTime())?new Date(updatedRaw).toLocaleDateString('pt-BR'):'Sem data';
    const link=editingProductCode?productCostLink(editingProductCode):null;
    const stale=!!(link&&link.calculationId===calc.id&&String(link.calculationUpdatedAt||'')!==String(calc.updatedAt||calc.createdAt||''));
    box.innerHTML=`<strong>${escapeHtml(calcProductName(calc))}</strong>
      <div class="product-cost-facts">
        <span><small>Custo por unidade</small><strong>${fmtMoney(cost)}</strong></span>
        <span><small>Material</small><strong>${escapeHtml(material)} · ${grams.toLocaleString('pt-BR')} g</strong></span>
        <span><small>Máquina</small><strong>${escapeHtml(machine)} · ${hours.toLocaleString('pt-BR')} h</strong></span>
        <span><small>Último cálculo</small><strong>${updated}</strong></span>
      </div>${stale?'<span class="cost-stale-warning">Este cálculo foi atualizado depois do último salvamento do produto. Revise os preços e salve novamente.</span>':''}`;
    useBtn.style.display='inline-flex';
    updateProductPricePreview();
  }

  async function saveProductCostLink(productCode,previousCode){
    PRODUCT_COST_LINKS=await getJSON(PRODUCT_COST_LINKS_KEY,PRODUCT_COST_LINKS);
    const codes=new Set([productCode,previousCode].filter(Boolean));
    PRODUCT_COST_LINKS=PRODUCT_COST_LINKS.filter(link=>!codes.has(link.productCode));
    const calc=selectedCostCalculation();
    if(calc){
      PRODUCT_COST_LINKS.push({
        productCode,
        calculationId:calc.id,
        calculationUpdatedAt:calc.updatedAt||calc.createdAt||null,
        linkedAt:new Date().toISOString()
      });
    }
    await setJSON(PRODUCT_COST_LINKS_KEY,PRODUCT_COST_LINKS);
  }

  function updateProductPricePreview(){
    const publicPrice=parseFloat(document.getElementById('p-public-price').value);
    const consigPrice=parseFloat(document.getElementById('p-price').value);
    const consignmentAvailable=!document.getElementById('p-no-consignment').checked;
    const promoPrice=parseFloat(document.getElementById('p-promo-price').value);
    const marginEl=document.getElementById('p-margin-preview');
    const hlMarginEl=document.getElementById('p-hl-margin-preview');
    const discountEl=document.getElementById('p-discount-preview');
    const statusEl=document.getElementById('p-price-status-preview');
    marginEl.textContent=consignmentAvailable&&!isNaN(publicPrice)&&!isNaN(consigPrice)&&publicPrice>0 ? `${Math.max(0,((publicPrice-consigPrice)/publicPrice)*100).toFixed(1).replace('.',',')}%` : 'Não se aplica';
    const calc=selectedCostCalculation(),unitCost=calc?calcUnitCost(calc):NaN;
    hlMarginEl.textContent=consignmentAvailable&&!isNaN(consigPrice)&&consigPrice>0&&Number.isFinite(unitCost) ? `${(((consigPrice-unitCost)/consigPrice)*100).toFixed(1).replace('.',',')}%` : (consignmentAvailable?'—':'Não se aplica');
    discountEl.textContent=!isNaN(publicPrice)&&!isNaN(promoPrice)&&promoPrice>0&&promoPrice<publicPrice ? `${((1-promoPrice/publicPrice)*100).toFixed(1).replace('.',',')}%` : '—';
    if(isNaN(publicPrice)||publicPrice<=0)statusEl.textContent='Informe o preço público';
    else if(!consignmentAvailable)statusEl.textContent='Somente venda direta';
    else if(isNaN(consigPrice)||consigPrice<0)statusEl.textContent='Informe o repasse';
    else if(consigPrice>publicPrice)statusEl.textContent='Repasse acima do público';
    else if(Number.isFinite(unitCost)&&consigPrice<unitCost)statusEl.textContent='Repasse abaixo do custo';
    else if(!isNaN(promoPrice)&&(promoPrice<=0||promoPrice>=publicPrice))statusEl.textContent='Promoção inválida';
    else statusEl.textContent='Valores válidos';
  }

  function updateConsignmentFieldState(){
    const unavailable=document.getElementById('p-no-consignment').checked,field=document.getElementById('p-price');
    field.disabled=unavailable;
    field.closest('.field').style.opacity=unavailable?'.5':'1';
    field.placeholder=unavailable?'Não se aplica':'18,75';
    updateProductPricePreview();
  }

  function updateProductImagePreview(){
    const url=document.getElementById('p-img').value.trim();
    const box=document.getElementById('p-image-preview-box');
    box.style.backgroundImage=url?`url("${url.replace(/"/g,'%22')}")`:'';
    box.textContent=url?'':'Prévia da imagem principal';
  }

  function loadImageForOptimization(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Não foi possível processar esta imagem.'));};
      image.src=url;
    });
  }

  let imageCropState=null;
  function cropBaseScale(){
    if(!imageCropState)return 1;
    const quarterTurn=Math.abs(imageCropState.rotation%180)===90;
    const width=quarterTurn?imageCropState.image.naturalHeight:imageCropState.image.naturalWidth;
    const height=quarterTurn?imageCropState.image.naturalWidth:imageCropState.image.naturalHeight;
    return imageCropState.fit==='contain'?Math.min(800/width,800/height):Math.max(800/width,800/height);
  }
  function updateImageCropFitButtons(){
    const contain=imageCropState?.fit==='contain';
    document.getElementById('image-crop-cover').classList.toggle('active',!contain);
    document.getElementById('image-crop-contain').classList.toggle('active',contain);
    document.getElementById('image-crop-title').nextElementSibling.textContent=contain?'A fotografia inteira será centralizada no quadro, sem cortar as bordas.':'Arraste a imagem para posicioná-la. A área quadrada será usada no catálogo.';
  }
  function setImageCropFit(fit){
    if(!imageCropState)return;
    imageCropState.fit=fit;imageCropState.zoom=1;imageCropState.offsetX=0;imageCropState.offsetY=0;
    document.getElementById('image-crop-zoom').value='1';updateImageCropFitButtons();drawImageCrop();
  }
  function constrainImageCrop(){
    if(!imageCropState)return;
    const quarterTurn=Math.abs(imageCropState.rotation%180)===90;
    const width=quarterTurn?imageCropState.image.naturalHeight:imageCropState.image.naturalWidth;
    const height=quarterTurn?imageCropState.image.naturalWidth:imageCropState.image.naturalHeight;
    const scale=cropBaseScale()*imageCropState.zoom;
    const maxX=Math.max(0,(width*scale-800)/2),maxY=Math.max(0,(height*scale-800)/2);
    imageCropState.offsetX=Math.max(-maxX,Math.min(maxX,imageCropState.offsetX));
    imageCropState.offsetY=Math.max(-maxY,Math.min(maxY,imageCropState.offsetY));
  }
  function drawImageCrop(){
    if(!imageCropState)return;
    constrainImageCrop();
    const canvas=document.getElementById('image-crop-canvas'),context=canvas.getContext('2d',{alpha:true});
    context.clearRect(0,0,800,800);context.save();
    context.translate(400+imageCropState.offsetX,400+imageCropState.offsetY);
    context.rotate(imageCropState.rotation*Math.PI/180);
    const scale=cropBaseScale()*imageCropState.zoom;context.scale(scale,scale);
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.drawImage(imageCropState.image,-imageCropState.image.naturalWidth/2,-imageCropState.image.naturalHeight/2);
    context.restore();
  }
  function resetImageCrop(){
    if(!imageCropState)return;
    imageCropState.rotation=0;imageCropState.zoom=1;imageCropState.offsetX=0;imageCropState.offsetY=0;
    document.getElementById('image-crop-zoom').value='1';updateImageCropFitButtons();drawImageCrop();
  }
  function finishImageCrop(result,error){
    if(!imageCropState)return;
    const state=imageCropState;imageCropState=null;
    const modal=document.getElementById('image-crop-modal');modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';
    if(error)state.reject(error);else state.resolve(result);
  }
  function openImageCropper(file){
    if(file.type==='image/gif')return Promise.resolve(file);
    return loadImageForOptimization(file).then(image=>new Promise((resolve,reject)=>{
      imageCropState={file,image,rotation:0,zoom:1,offsetX:0,offsetY:0,fit:'cover',resolve,reject,pointerId:null,lastX:0,lastY:0};
      const modal=document.getElementById('image-crop-modal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
      document.getElementById('image-crop-zoom').value='1';updateImageCropFitButtons();drawImageCrop();document.getElementById('image-crop-confirm').focus();
    }));
  }
  async function exportImageCrop(){
    if(!imageCropState)return;
    const state=imageCropState,output=document.createElement('canvas');output.width=1600;output.height=1600;
    const context=output.getContext('2d',{alpha:true});
    if(!context){finishImageCrop(null,new Error('O navegador não conseguiu preparar o recorte.'));return;}
    constrainImageCrop();context.clearRect(0,0,1600,1600);context.save();
    context.translate(800+state.offsetX*2,800+state.offsetY*2);context.rotate(state.rotation*Math.PI/180);
    const scale=cropBaseScale()*state.zoom*2;context.scale(scale,scale);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.drawImage(state.image,-state.image.naturalWidth/2,-state.image.naturalHeight/2);context.restore();
    const blob=await new Promise(resolve=>output.toBlob(resolve,'image/webp',.9));
    if(!blob){finishImageCrop(null,new Error('Não foi possível gerar a imagem ajustada.'));return;}
    const name=`${state.file.name.replace(/\.[^.]+$/,'')||'imagem'}-ajustada.webp`;
    finishImageCrop(new File([blob],name,{type:'image/webp',lastModified:Date.now()}));
  }
  document.getElementById('image-crop-left').addEventListener('click',()=>{if(!imageCropState)return;imageCropState.rotation=(imageCropState.rotation+270)%360;imageCropState.offsetX=0;imageCropState.offsetY=0;drawImageCrop();});
  document.getElementById('image-crop-right').addEventListener('click',()=>{if(!imageCropState)return;imageCropState.rotation=(imageCropState.rotation+90)%360;imageCropState.offsetX=0;imageCropState.offsetY=0;drawImageCrop();});
  document.getElementById('image-crop-cover').addEventListener('click',()=>setImageCropFit('cover'));
  document.getElementById('image-crop-contain').addEventListener('click',()=>setImageCropFit('contain'));
  document.getElementById('image-crop-reset').addEventListener('click',resetImageCrop);
  document.getElementById('image-crop-zoom').addEventListener('input',event=>{if(!imageCropState)return;imageCropState.zoom=Number(event.target.value)||1;drawImageCrop();});
  document.getElementById('image-crop-cancel').addEventListener('click',()=>finishImageCrop(null,new Error('Envio cancelado.')));
  document.getElementById('image-crop-confirm').addEventListener('click',exportImageCrop);
  document.getElementById('image-crop-modal').addEventListener('click',event=>{if(event.target.id==='image-crop-modal')finishImageCrop(null,new Error('Envio cancelado.'));});
  const imageCropStage=document.getElementById('image-crop-stage');
  imageCropStage.addEventListener('pointerdown',event=>{if(!imageCropState)return;imageCropState.pointerId=event.pointerId;imageCropState.lastX=event.clientX;imageCropState.lastY=event.clientY;imageCropStage.setPointerCapture(event.pointerId);imageCropStage.classList.add('dragging');});
  imageCropStage.addEventListener('pointermove',event=>{if(!imageCropState||imageCropState.pointerId!==event.pointerId)return;const rect=imageCropStage.getBoundingClientRect(),factor=800/rect.width;imageCropState.offsetX+=(event.clientX-imageCropState.lastX)*factor;imageCropState.offsetY+=(event.clientY-imageCropState.lastY)*factor;imageCropState.lastX=event.clientX;imageCropState.lastY=event.clientY;drawImageCrop();});
  const stopCropDrag=event=>{if(!imageCropState||imageCropState.pointerId!==event.pointerId)return;imageCropState.pointerId=null;imageCropStage.classList.remove('dragging');};
  imageCropStage.addEventListener('pointerup',stopCropDrag);imageCropStage.addEventListener('pointercancel',stopCropDrag);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&imageCropState){event.preventDefault();finishImageCrop(null,new Error('Envio cancelado.'));}});

  async function optimizeProductImage(file){
    const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
    if(!file||!allowed[file.type])throw new Error('Use uma imagem JPG, PNG, WEBP ou GIF.');
    if(file.size>25*1024*1024)throw new Error('A imagem original deve ter no máximo 25 MB.');
    if(file.type==='image/gif'){
      if(file.size>8*1024*1024)throw new Error('O GIF deve ter no máximo 8 MB.');
      return file;
    }
    try{
      const image=await loadImageForOptimization(file);
      const maxSide=2000,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      if(scale===1&&file.size<=1500*1024)return file;
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{alpha:true});
      if(!context)throw new Error('O navegador não conseguiu preparar a imagem.');
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
      if(!blob)throw new Error('Não foi possível otimizar a imagem.');
      if(blob.type!=='image/webp'){
        if(file.size<=8*1024*1024)return file;
        throw new Error('Este navegador não conseguiu reduzir a imagem.');
      }
      if(scale===1&&blob.size>=file.size)return file;
      return new File([blob],`${file.name.replace(/\.[^.]+$/,'')||'imagem'}.webp`,{type:'image/webp',lastModified:Date.now()});
    }catch(error){
      if(file.size<=8*1024*1024)return file;
      throw error;
    }
  }

  async function uploadProductImage(file,folder,forcedCode){
    const adjustedFile=await openImageCropper(file);
    const optimizedFile=await optimizeProductImage(adjustedFile);
    const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
    if(optimizedFile.size>8*1024*1024)throw new Error('Mesmo após a otimização, a imagem ultrapassou 8 MB.');
    const productCode=(String(forcedCode||document.getElementById('p-code').value).trim().toLowerCase().replace(/[^a-z0-9-]/g,'')||'rascunho');
    const randomPart=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path=`${productCode}/${folder}/${Date.now()}-${randomPart}.${allowed[optimizedFile.type]}`;
    const {error}=await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(path,optimizedFile,{cacheControl:'31536000',upsert:false,contentType:optimizedFile.type});
    if(error){
      const detail=String(error.message||'');
      if(/bucket|not found/i.test(detail))throw new Error('O espaço de imagens ainda não foi configurado. Execute o SQL atualizado no Supabase.');
      if(/row.level|policy|unauthorized|permission/i.test(detail))throw new Error('Permissão de envio indisponível. Execute o SQL atualizado e entre novamente na administração.');
      throw new Error(`Não foi possível enviar a imagem: ${detail||'tente novamente.'}`);
    }
    const {data}=supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
    if(!data?.publicUrl)throw new Error('A imagem foi enviada, mas o link público não pôde ser gerado.');
    mediaLoaded=false;
    return data.publicUrl;
  }

  function readVideoInfo(file){
    return new Promise((resolve,reject)=>{
      const url=typeof URL.createObjectURL==='function'?URL.createObjectURL(file):'';
      if(!url){reject(new Error('O navegador não conseguiu abrir o vídeo.'));return;}
      const video=document.createElement('video');video.preload='metadata';video.playsInline=true;video.muted=true;
      const cleanup=()=>URL.revokeObjectURL(url);
      video.onloadedmetadata=()=>{
        const info={duration:Number(video.duration)||0,width:Number(video.videoWidth)||0,height:Number(video.videoHeight)||0,url,video,cleanup};
        if(!info.duration||!info.width||!info.height){cleanup();reject(new Error('Não foi possível identificar a duração ou resolução do vídeo.'));return;}
        resolve(info);
      };
      video.onerror=()=>{cleanup();reject(new Error('Formato de vídeo não reconhecido neste aparelho.'));};
      video.src=url;
    });
  }

  function preferredVideoRecordingType(){
    if(typeof MediaRecorder==='undefined')return '';
    const options=['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm','video/mp4;codecs=avc1.42E01E','video/mp4'];
    return options.find(type=>!MediaRecorder.isTypeSupported||MediaRecorder.isTypeSupported(type))||'';
  }

  async function optimizeProductVideo(file,onProgress=()=>{}){
    const allowed=['video/mp4','video/webm','video/quicktime'];
    const inferred=/\.mov$/i.test(file?.name||'')?'video/quicktime':/\.webm$/i.test(file?.name||'')?'video/webm':/\.mp4$/i.test(file?.name||'')?'video/mp4':'';
    const inputType=file?.type||inferred;
    if(!file||!allowed.includes(inputType))throw new Error('Use um vídeo MP4, MOV ou WEBM.');
    if(file.size>120*1024*1024)throw new Error('O vídeo original deve ter no máximo 120 MB.');
    const info=await readVideoInfo(file);
    if(info.duration>60.5){info.cleanup();throw new Error('O vídeo deve ter no máximo 60 segundos. Corte o arquivo e tente novamente.');}
    const duration=Math.max(1,info.duration),originalSize=file.size;
    if(originalSize<=8*1024*1024&&inputType!=='video/quicktime'){
      info.cleanup();onProgress(100);return {file,duration,originalSize,optimized:false};
    }
    const canvas=document.createElement('canvas'),recordingType=preferredVideoRecordingType();
    if(!canvas.captureStream||!recordingType){
      info.cleanup();
      if(originalSize<=18*1024*1024){onProgress(100);return {file,duration,originalSize,optimized:false};}
      throw new Error('Este navegador não consegue reduzir vídeos. Envie um MP4 ou WEBM com até 18 MB.');
    }
    const maxSide=720,scale=Math.min(1,maxSide/Math.max(info.width,info.height));
    canvas.width=Math.max(2,Math.round(info.width*scale/2)*2);canvas.height=Math.max(2,Math.round(info.height*scale/2)*2);
    const context=canvas.getContext('2d',{alpha:false});
    if(!context){info.cleanup();throw new Error('O navegador não conseguiu preparar a redução do vídeo.');}
    const outputStream=canvas.captureStream(24),sourceCapture=typeof info.video.captureStream==='function'?info.video.captureStream():typeof info.video.mozCaptureStream==='function'?info.video.mozCaptureStream():null;
    if(sourceCapture)sourceCapture.getAudioTracks().forEach(track=>{try{outputStream.addTrack(track);}catch(e){}});
    const chunks=[];let recorder;
    try{recorder=new MediaRecorder(outputStream,{mimeType:recordingType,videoBitsPerSecond:850000,audioBitsPerSecond:64000});}
    catch(error){info.cleanup();if(originalSize<=18*1024*1024)return {file,duration,originalSize,optimized:false};throw new Error('Não foi possível iniciar a redução do vídeo neste aparelho.');}
    const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};recorder.onerror=()=>reject(new Error('A redução do vídeo foi interrompida.'));recorder.onstop=resolve;});
    let frameId=0,timeoutId=0;
    const draw=()=>{
      if(info.video.ended||info.video.paused)return;
      context.drawImage(info.video,0,0,canvas.width,canvas.height);onProgress(Math.min(99,Math.round((info.video.currentTime/duration)*100)));frameId=requestAnimationFrame(draw);
    };
    try{
      info.video.currentTime=0;recorder.start(1000);await info.video.play();draw();
      await new Promise((resolve,reject)=>{info.video.onended=resolve;info.video.onerror=()=>reject(new Error('Não foi possível processar o vídeo.'));timeoutId=setTimeout(()=>reject(new Error('A redução do vídeo demorou mais que o esperado.')),Math.ceil((duration+15)*1000));});
      clearTimeout(timeoutId);cancelAnimationFrame(frameId);if(recorder.state!=='inactive')recorder.stop();await stopped;
    }catch(error){clearTimeout(timeoutId);cancelAnimationFrame(frameId);if(recorder.state!=='inactive')recorder.stop();info.cleanup();if(originalSize<=18*1024*1024)return {file,duration,originalSize,optimized:false};throw error;}
    info.cleanup();onProgress(100);
    const outputType=String(recorder.mimeType||recordingType).split(';')[0],blob=new Blob(chunks,{type:outputType});
    if(!blob.size||blob.size>=originalSize){if(originalSize<=18*1024*1024)return {file,duration,originalSize,optimized:false};throw new Error('O vídeo continuou muito grande após a redução. Tente cortar a duração.');}
    const extension=outputType==='video/mp4'?'mp4':'webm';
    return {file:new File([blob],`${file.name.replace(/\.[^.]+$/,'')||'video'}-otimizado.${extension}`,{type:outputType,lastModified:Date.now()}),duration,originalSize,optimized:true};
  }

  async function uploadProductVideo(file,onProgress){
    const result=await optimizeProductVideo(file,onProgress),finalFile=result.file;
    if(finalFile.size>18*1024*1024)throw new Error('O vídeo final ultrapassou 18 MB. Reduza a duração e tente novamente.');
    const extensions={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'},extension=extensions[finalFile.type]||'mp4';
    const productCode=(String(document.getElementById('p-code').value).trim().toLowerCase().replace(/[^a-z0-9-]/g,'')||'rascunho');
    const randomPart=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path=`${productCode}/videos/${Date.now()}-${randomPart}.${extension}`;
    const {error}=await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(path,finalFile,{cacheControl:'31536000',upsert:false,contentType:finalFile.type});
    if(error){
      const detail=String(error.message||'');
      if(/mime|bucket|not found|maximum|size/i.test(detail))throw new Error('O armazenamento ainda não aceita vídeos. Execute o SQL de ativação fornecido e tente novamente.');
      if(/row.level|policy|unauthorized|permission/i.test(detail))throw new Error('Permissão de envio indisponível. Entre novamente na administração.');
      throw new Error(`Não foi possível enviar o vídeo: ${detail||'tente novamente.'}`);
    }
    const {data}=supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
    if(!data?.publicUrl)throw new Error('O vídeo foi enviado, mas o link público não pôde ser gerado.');
    mediaLoaded=false;return {...result,url:data.publicUrl,finalSize:finalFile.size};
  }

  function renderPendingGallery(){
    const wrap=document.getElementById('p-pending-gallery');
    if(!wrap)return;
    wrap.innerHTML=pendingGallery.map((url,index)=>`<div class="pending-gallery-item" draggable="true" data-pending-gallery-item="${index}" style="background-image:url('${String(url).replace(/'/g,'%27')}')"><span class="gallery-drag-hint" title="Arraste para ordenar">⋮⋮</span><button type="button" class="gallery-cover-btn" data-pending-gallery-cover="${index}" title="Usar como imagem principal">★ Capa</button><div class="gallery-order-controls"><button type="button" data-move-pending-gallery="${index}|-1" aria-label="Mover foto para a esquerda" ${index===0?'disabled':''}>←</button><button type="button" data-remove-pending-gallery="${index}" aria-label="Remover foto">✕</button><button type="button" data-move-pending-gallery="${index}|1" aria-label="Mover foto para a direita" ${index===pendingGallery.length-1?'disabled':''}>→</button></div></div>`).join('');
    wrap.querySelectorAll('[data-remove-pending-gallery]').forEach(btn=>btn.addEventListener('click',()=>{pendingGallery.splice(Number(btn.dataset.removePendingGallery),1);renderPendingGallery();markProductDirty();}));
    wrap.querySelectorAll('[data-move-pending-gallery]').forEach(btn=>btn.addEventListener('click',()=>{const [index,delta]=btn.dataset.movePendingGallery.split('|').map(Number),target=index+delta;if(target<0||target>=pendingGallery.length)return;[pendingGallery[index],pendingGallery[target]]=[pendingGallery[target],pendingGallery[index]];renderPendingGallery();markProductDirty();}));
    wrap.querySelectorAll('[data-pending-gallery-cover]').forEach(btn=>btn.addEventListener('click',()=>{
      const index=Number(btn.dataset.pendingGalleryCover),selected=pendingGallery[index];if(!selected)return;
      const current=document.getElementById('p-img').value.trim();pendingGallery.splice(index,1);
      if(current&&current!==selected&&!pendingGallery.includes(current))pendingGallery.unshift(current);
      document.getElementById('p-img').value=selected;updateProductImagePreview();updateProductFinalPreview();renderPendingGallery();
      document.getElementById('p-gallery-upload-status').textContent='Imagem principal trocada. A capa anterior foi preservada na galeria.';
      markProductDirty();
    }));
    wrap.querySelectorAll('[data-pending-gallery-item]').forEach(item=>{
      item.addEventListener('dragstart',event=>{item.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.dataset.pendingGalleryItem);});
      item.addEventListener('dragend',()=>item.classList.remove('dragging'));
      item.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='move';});
      item.addEventListener('drop',event=>{event.preventDefault();const from=Number(event.dataTransfer.getData('text/plain')),to=Number(item.dataset.pendingGalleryItem);if(!Number.isInteger(from)||from===to)return;const [moved]=pendingGallery.splice(from,1);pendingGallery.splice(to,0,moved);renderPendingGallery();markProductDirty();});
    });
  }

  function bindSingleImageUpload(inputId,buttonId,statusId,targetId,folder){
    const input=document.getElementById(inputId),button=document.getElementById(buttonId),status=document.getElementById(statusId);
    button.addEventListener('click',()=>input.click());
    input.addEventListener('change',async ()=>{
      const file=input.files?.[0];if(!file)return;
      button.disabled=true;status.textContent=file.type==='image/gif'?'Enviando GIF…':'Aguardando ajuste da imagem…';
      try{
        const url=await uploadProductImage(file,folder);
        document.getElementById(targetId).value=url;
        markProductDirty();
        status.textContent='Foto enviada com sucesso.';
        if(targetId==='p-img'){updateProductImagePreview();updateProductFinalPreview();}
      }catch(error){status.textContent=error.message||'Falha no envio.';}
      finally{button.disabled=false;input.value='';}
    });
  }

  bindSingleImageUpload('p-main-image-file','p-main-image-upload-btn','p-main-image-upload-status','p-img','principal');
  bindSingleImageUpload('p-first-color-file','p-first-color-upload-btn','p-first-color-upload-status','p-first-color-img','variacoes');
  const productVideoInput=document.getElementById('p-video-file'),productVideoButton=document.getElementById('p-video-upload-btn'),productVideoStatus=document.getElementById('p-video-upload-status'),productVideoProgress=document.getElementById('p-video-upload-progress'),productVideoSummary=document.getElementById('p-video-upload-summary');
  async function handleProductVideoFile(file){
    if(!file)return;
    productVideoButton.disabled=true;productVideoStatus.textContent='Analisando vídeo…';productVideoProgress.value=0;productVideoProgress.classList.add('active');productVideoSummary.classList.remove('visible');productVideoSummary.innerHTML='';
    try{
      const result=await uploadProductVideo(file,percent=>{productVideoProgress.value=percent;productVideoStatus.textContent=percent<100?`Otimizando vídeo… ${percent}%`:'Enviando vídeo…';});
      document.getElementById('p-video').value=result.url;markProductDirty();
      const saved=Math.max(0,result.originalSize-result.finalSize),durationText=`${Math.round(result.duration)} s`;
      productVideoStatus.textContent='Vídeo enviado com sucesso.';
      productVideoSummary.innerHTML=result.optimized
        ? `<span aria-hidden="true">✓</span><span><strong>Vídeo otimizado:</strong> ${formatFileSize(result.originalSize)} → ${formatFileSize(result.finalSize)} · ${durationText}${saved?` · redução de ${Math.round(saved/result.originalSize*100)}%`:''}</span>`
        : `<span aria-hidden="true">✓</span><span><strong>Arquivo já adequado:</strong> ${formatFileSize(result.finalSize)} · ${durationText}</span>`;
      productVideoSummary.classList.add('visible');updateProductFinalPreview();
    }catch(error){productVideoStatus.textContent=error.message||'Falha no envio do vídeo.';productVideoProgress.value=0;}
    finally{productVideoButton.disabled=false;productVideoProgress.classList.remove('active');productVideoInput.value='';}
  }
  productVideoButton.addEventListener('click',()=>productVideoInput.click());
  productVideoInput.addEventListener('change',()=>handleProductVideoFile(productVideoInput.files?.[0]));
  const productVideoBox=document.getElementById('p-video-upload-box');
  ['dragenter','dragover'].forEach(type=>productVideoBox.addEventListener(type,event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';productVideoBox.classList.add('drag-over');}));
  ['dragleave','drop'].forEach(type=>productVideoBox.addEventListener(type,event=>{event.preventDefault();productVideoBox.classList.remove('drag-over');}));
  productVideoBox.addEventListener('drop',event=>{const file=[...(event.dataTransfer?.files||[])].find(item=>item.type.startsWith('video/')||/\.(mp4|mov|webm)$/i.test(item.name));if(file)handleProductVideoFile(file);else productVideoStatus.textContent='Arraste um vídeo MP4, MOV ou WEBM.';});
  root.querySelectorAll('[data-image-drop-target]').forEach(box=>{
    ['dragenter','dragover'].forEach(type=>box.addEventListener(type,event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';box.classList.add('drag-over');}));
    ['dragleave','drop'].forEach(type=>box.addEventListener(type,event=>{event.preventDefault();box.classList.remove('drag-over');}));
    box.addEventListener('drop',event=>{
      const input=document.getElementById(box.dataset.imageDropTarget),incoming=[...(event.dataTransfer?.files||[])].filter(file=>file.type.startsWith('image/'));
      if(!input||!incoming.length)return;
      try{const transfer=new DataTransfer();(input.multiple?incoming:[incoming[0]]).forEach(file=>transfer.items.add(file));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
      catch(error){const status=box.querySelector('.upload-status');if(status)status.textContent='Não foi possível receber o arquivo arrastado. Use o botão para selecionar.';}
    });
  });
  document.getElementById('p-gallery-upload-btn').addEventListener('click',()=>document.getElementById('p-gallery-files').click());
  document.getElementById('p-gallery-files').addEventListener('change',async event=>{
    const files=[...(event.target.files||[])].filter((file,index,list)=>list.findIndex(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified)===index);if(!files.length)return;
    const button=document.getElementById('p-gallery-upload-btn'),status=document.getElementById('p-gallery-upload-status');
    button.disabled=true;
    let uploaded=0;
    try{
      for(const file of files){
        status.textContent=`Ajuste a foto ${uploaded+1} de ${files.length}…`;
        const url=await uploadProductImage(file,'galeria');
        if(!pendingGallery.includes(url))pendingGallery.push(url);
        uploaded++;renderPendingGallery();
      }
      status.textContent=`${uploaded} foto${uploaded===1?'':'s'} adicionada${uploaded===1?'':'s'}.`;
      markProductDirty();
    }catch(error){status.textContent=`${uploaded?uploaded+' enviada(s). ':''}${error.message||'Falha no envio.'}`;}
    finally{button.disabled=false;event.target.value='';}
  });

  function storagePathFromUrl(url){
    if(!url)return null;
    const marker=`/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
    const clean=String(url).split('#')[0].split('?')[0],index=clean.indexOf(marker);
    if(index<0)return null;
    try{return decodeURIComponent(clean.slice(index+marker.length));}catch(e){return clean.slice(index+marker.length);}
  }

  function mediaReferenceMap(){
    const references=new Map();
    const add=(url,label,productCode)=>{
      const path=storagePathFromUrl(url);if(!path)return;
      if(!references.has(path))references.set(path,{labels:new Set(),productCodes:new Set()});
      references.get(path).labels.add(label);
      if(productCode)references.get(path).productCodes.add(productCode);
    };
    PRODUCTS.forEach(product=>{
      const label=`${product.code} · ${product.name}`;
      add(product.image,`${label} (principal)`,product.code);
      add(product.video,`${label} (vídeo)`,product.code);
      (product.gallery||[]).forEach((url,index)=>add(url,`${label} (galeria ${index+1})`,product.code));
      (product.colors||[]).forEach(color=>add(color.image,`${label} (${color.name})`,product.code));
    });
    const draftCode=(document.getElementById('p-code')?.value||'').trim().toUpperCase()||null;
    add(document.getElementById('p-img')?.value,'Cadastro em edição (principal)',draftCode);
    add(document.getElementById('p-video')?.value,'Cadastro em edição (vídeo)',draftCode);
    add(document.getElementById('p-first-color-img')?.value,'Cadastro em edição (variação)',draftCode);
    pendingColors.forEach((color,index)=>add(color.image,`Cadastro em edição (${color.name||'variação '+(index+1)})`,draftCode));
    pendingGallery.forEach((url,index)=>add(url,`Cadastro em edição (galeria ${index+1})`,draftCode));
    return references;
  }

  function formatFileSize(bytes){
    const value=Number(bytes)||0;if(value<1024)return `${value} B`;
    if(value<1024*1024)return `${(value/1024).toFixed(1).replace('.',',')} KB`;
    if(value>=1024*1024*1024)return `${(value/(1024*1024*1024)).toFixed(2).replace('.',',')} GB`;
    return `${(value/(1024*1024)).toFixed(2).replace('.',',')} MB`;
  }

  async function listProductImageFiles(){
    const files=[],queue=[''];
    while(queue.length){
      const prefix=queue.shift();let offset=0;
      while(true){
        const {data,error}=await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
        if(error)throw error;
        const entries=Array.isArray(data)?data:[];
        for(const entry of entries){
          if(!entry?.name||entry.name==='.emptyFolderPlaceholder')continue;
          const path=prefix?`${prefix}/${entry.name}`:entry.name;
          const isFile=!!entry.metadata||!!entry.id;
          if(isFile){
            const {data:publicData}=supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
            files.push({path,name:entry.name,size:Number(entry.metadata?.size)||0,mimeType:entry.metadata?.mimetype||entry.metadata?.contentType||'',createdAt:entry.created_at||entry.updated_at||entry.last_accessed_at||'',url:publicData?.publicUrl||''});
          }else if(path.split('/').length<6)queue.push(path);
        }
        if(entries.length<1000)break;
        offset+=entries.length;
      }
    }
    return files;
  }

  function renderMediaLibrary(){
    const grid=document.getElementById('media-grid'),summary=document.getElementById('media-summary');if(!grid||!summary)return;
    const references=mediaReferenceMap();
    const enriched=MEDIA_FILES.map(file=>({...file,reference:references.get(file.path)||null}));
    const used=enriched.filter(file=>file.reference).length,totalSize=enriched.reduce((sum,file)=>sum+file.size,0);
    const capacityBytes=mediaCapacityMb*1024*1024,availableBytes=Math.max(0,capacityBytes-totalSize),usagePercent=capacityBytes?Math.min(100,(totalSize/capacityBytes)*100):0;
    summary.innerHTML=`<div class="media-summary-card"><small>Arquivos</small><strong>${enriched.length}</strong></div><div class="media-summary-card"><small>Em uso</small><strong>${used}</strong></div><div class="media-summary-card"><small>Não vinculados</small><strong>${enriched.length-used}</strong></div><div class="media-summary-card"><small>Espaço usado</small><strong>${formatFileSize(totalSize)}</strong></div><div class="media-summary-card"><small>Disponível estimado</small><strong>${formatFileSize(availableBytes)}</strong></div>`;
    const storageBar=document.getElementById('media-storage-bar'),storageDetail=document.getElementById('media-storage-detail'),storageProgress=storageBar?.parentElement;
    if(storageBar){storageBar.style.width=`${usagePercent}%`;storageBar.className=usagePercent>=95?'danger':usagePercent>=80?'warning':'';}
    if(storageProgress)storageProgress.setAttribute('aria-valuenow',usagePercent.toFixed(1));
    if(storageDetail)storageDetail.textContent=`${formatFileSize(totalSize)} usados de ${formatFileSize(capacityBytes)} (${usagePercent.toFixed(1).replace('.',',')}%). Restam aproximadamente ${formatFileSize(availableBytes)}.`;
    const query=mediaSearch.toLowerCase();
    const filtered=enriched.filter(file=>{
      const statusMatch=mediaStatus==='all'||(mediaStatus==='used'&&file.reference)||(mediaStatus==='unused'&&!file.reference);
      const labels=file.reference?[...file.reference.labels].join(' '):'';
      return statusMatch&&(!query||`${file.path} ${labels}`.toLowerCase().includes(query));
    }).sort((a,b)=>{
      if(mediaSort==='oldest')return String(a.createdAt).localeCompare(String(b.createdAt));
      if(mediaSort==='size-desc')return b.size-a.size;
      if(mediaSort==='name')return a.path.localeCompare(b.path,'pt-BR');
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    if(!filtered.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1;"><div class="glyph">▧</div>Nenhum arquivo encontrado com estes filtros.</div>';return;}
    grid.innerHTML=filtered.map(file=>{
      const reference=file.reference,labels=reference?[...reference.labels]:[];
      const date=file.createdAt?new Date(file.createdAt).toLocaleDateString('pt-BR'):'data indisponível';
      const productCode=reference?.productCodes?.size?[...reference.productCodes][0]:'';
      const isVideo=String(file.mimeType).startsWith('video/')||/\.(mp4|mov|webm)$/i.test(file.name);
      const linkedProduct=productCode?PRODUCTS.find(item=>item.code===productCode):null,canBecomeCover=!!(!isVideo&&linkedProduct&&linkedProduct.image!==file.url);
      return `<article class="media-card">
        <div class="media-card-image" ${isVideo?'':`style="background-image:url('${String(file.url).replace(/'/g,'%27')}')"`}>${isVideo?`<video src="${escapeHtml(file.url)}" muted playsinline preload="metadata"></video>`:''}<span class="badge ${reference?'aprovado':'pendente'}">${isVideo?'Vídeo · ':''}${reference?'Em uso':'Não vinculado'}</span></div>
        <div class="media-card-body"><div class="media-card-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</div><div class="media-card-meta">${escapeHtml(labels[0]||file.path)}<br>${formatFileSize(file.size)} · ${date}${labels.length>1?` · +${labels.length-1} vínculo${labels.length===2?'':'s'}`:''}</div>
        <div class="media-card-actions"><button type="button" data-copy-media="${encodeURIComponent(file.url)}">Copiar link</button>${productCode?`<button type="button" data-open-media-product="${escapeHtml(productCode)}">Ver produto</button>`:''}${canBecomeCover?`<button type="button" data-media-cover="${encodeURIComponent(productCode+'|'+file.url)}">★ Usar como capa</button>`:''}<button type="button" data-delete-media="${encodeURIComponent(file.path)}" class="danger-action" ${reference?'disabled title="Remova primeiro a imagem do produto"':'title="Excluir arquivo não vinculado"'}>Excluir</button></div></div>
      </article>`;
    }).join('');
    grid.querySelectorAll('[data-copy-media]').forEach(button=>button.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(decodeURIComponent(button.dataset.copyMedia));button.textContent='Link copiado';setTimeout(()=>button.textContent='Copiar link',1400);}catch(e){document.getElementById('media-msg').innerHTML='<div class="msg err">Não foi possível copiar automaticamente. Abra a imagem e copie o endereço.</div>';}
    }));
    grid.querySelectorAll('[data-open-media-product]').forEach(button=>button.addEventListener('click',async()=>{
      await openAdminProductEditor(button.dataset.openMediaProduct);
    }));
    grid.querySelectorAll('[data-media-cover]').forEach(button=>button.addEventListener('click',async()=>{
      const [code,url]=decodeURIComponent(button.dataset.mediaCover).split(/\|(.+)/);if(!code||!url)return;
      button.disabled=true;button.textContent='Trocando…';
      try{const changed=await setProductImageAsCover(code,url);document.getElementById('media-msg').innerHTML=changed?'<div class="msg ok">Imagem principal atualizada. A capa anterior foi preservada na galeria.</div>':'<div class="msg ok">Esta imagem já é a capa do produto.</div>';renderMediaLibrary();}
      catch(error){button.disabled=false;button.textContent='★ Usar como capa';document.getElementById('media-msg').innerHTML=`<div class="msg err">${escapeHtml(error.message||'Não foi possível trocar a capa.')}</div>`;}
    }));
    grid.querySelectorAll('[data-delete-media]').forEach(button=>button.addEventListener('click',async()=>{
      const path=decodeURIComponent(button.dataset.deleteMedia),currentReference=mediaReferenceMap().get(path);
      if(currentReference){document.getElementById('media-msg').innerHTML='<div class="msg err">Este arquivo voltou a ser usado e não pode ser excluído. Atualize a biblioteca.</div>';return;}
      if(!confirm(`Excluir definitivamente o arquivo “${path}”? Esta ação não pode ser desfeita.`))return;
      button.disabled=true;button.textContent='Excluindo…';
      const {error}=await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
      if(error){button.disabled=false;button.textContent='Excluir';document.getElementById('media-msg').innerHTML=`<div class="msg err">${escapeHtml(error.message||'Não foi possível excluir o arquivo.')}</div>`;return;}
      MEDIA_FILES=MEDIA_FILES.filter(file=>file.path!==path);document.getElementById('media-msg').innerHTML='<div class="msg ok">Arquivo não vinculado excluído.</div>';renderMediaLibrary();
    }));
  }

  async function loadMediaLibrary(force=false){
    const grid=document.getElementById('media-grid'),message=document.getElementById('media-msg');if(!grid)return;
    if(mediaLoaded&&!force){renderMediaLibrary();return;}
    grid.innerHTML='<div class="media-loading" style="grid-column:1/-1;">Carregando arquivos do catálogo…</div>';message.innerHTML='';
    try{MEDIA_FILES=await listProductImageFiles();mediaLoaded=true;renderMediaLibrary();}
    catch(error){grid.innerHTML='<div class="empty" style="grid-column:1/-1;"><div class="glyph">!</div>Não foi possível carregar os arquivos.</div>';message.innerHTML=`<div class="msg err">${escapeHtml(error.message||'Confira a configuração do armazenamento.')}</div>`;}
  }

  document.getElementById('media-refresh-btn').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Atualizando…';await loadMediaLibrary(true);button.disabled=false;button.textContent='↻ Atualizar arquivos';});
  document.getElementById('media-search').addEventListener('input',event=>{mediaSearch=event.target.value.trim();renderMediaLibrary();});
  document.getElementById('media-status').addEventListener('change',event=>{mediaStatus=event.target.value;renderMediaLibrary();});
  document.getElementById('media-sort').addEventListener('change',event=>{mediaSort=event.target.value;renderMediaLibrary();});
  const mediaCapacitySelect=document.getElementById('media-capacity-select');
  if(mediaCapacitySelect){
    if(![...mediaCapacitySelect.options].some(option=>Number(option.value)===mediaCapacityMb))mediaCapacityMb=1024;
    mediaCapacitySelect.value=String(mediaCapacityMb);
    mediaCapacitySelect.addEventListener('change',event=>{mediaCapacityMb=Number(event.target.value)||1024;localStorage.setItem(MEDIA_CAPACITY_KEY,String(mediaCapacityMb));renderMediaLibrary();});
  }
  document.getElementById('media-copy-unused-btn').addEventListener('click',async()=>{
    const references=mediaReferenceMap(),paths=MEDIA_FILES.filter(file=>!references.has(file.path)).map(file=>file.path);
    if(!paths.length){document.getElementById('media-msg').innerHTML='<div class="msg ok">Não há imagens não vinculadas.</div>';return;}
    try{await navigator.clipboard.writeText(paths.join('\n'));document.getElementById('media-msg').innerHTML=`<div class="msg ok">Lista com ${paths.length} arquivo${paths.length===1?'':'s'} copiada.</div>`;}catch(e){document.getElementById('media-msg').innerHTML='<div class="msg err">O navegador não permitiu copiar a lista.</div>';}
  });

  function updateProductFinalPreview(){
    const code=document.getElementById('p-code').value.trim().toUpperCase();
    const name=document.getElementById('p-name').value.trim();
    const desc=document.getElementById('p-desc').value.trim();
    const image=document.getElementById('p-img').value.trim();
    const price=parseFloat(document.getElementById('p-public-price').value);
    const promo=parseFloat(document.getElementById('p-promo-price').value);
    const previewImage=document.getElementById('p-final-preview-image');
    previewImage.style.backgroundImage=image?`url("${image.replace(/"/g,'%22')}")`:'';
    previewImage.textContent=image?'':'Sem imagem';
    document.getElementById('p-final-preview-code').textContent=code||'Código ainda não informado';
    document.getElementById('p-final-preview-name').textContent=name||'Nome do produto';
    document.getElementById('p-final-preview-desc').textContent=desc||'Adicione uma descrição para apresentar o produto.';
    document.getElementById('p-final-preview-categories').innerHTML=pendingCategories.length?pendingCategories.map(c=>`<span class="tag ${tagColorFor(c)}">${escapeHtml(c)}</span>`).join(' '):'<span class="tag teal">Sem categoria</span>';
    document.getElementById('p-final-preview-price').textContent=fmtMoney(!isNaN(promo)&&promo>0&&promo<price?promo:price);
    const status=document.getElementById('p-final-preview-status');
    status.textContent=document.getElementById('p-active').checked?'Publicado':'Rascunho';
    status.className=`badge ${document.getElementById('p-active').checked?'aprovado':'pendente'}`;
  }

  function showProductStep(step){
    currentProductStep=Math.max(0,Math.min(3,Number(step)||0));
    root.querySelectorAll('[data-product-step]').forEach(btn=>{
      const index=Number(btn.dataset.productStep),active=index===currentProductStep;
      btn.classList.toggle('active',active);btn.classList.toggle('done',index<currentProductStep);btn.setAttribute('aria-selected',String(active));
    });
    root.querySelectorAll('[data-product-step-panel]').forEach(panel=>panel.classList.toggle('active',Number(panel.dataset.productStepPanel)===currentProductStep));
    document.getElementById('p-step-prev-btn').style.display=currentProductStep?'inline-flex':'none';
    document.getElementById('p-step-next-btn').style.display=currentProductStep<3?'inline-flex':'none';
    document.getElementById('p-add-btn').style.display=currentProductStep===3?'inline-flex':'none';
    if(currentProductStep===3)updateProductFinalPreview();
  }

  root.querySelectorAll('[data-product-step]').forEach(btn=>btn.addEventListener('click',()=>showProductStep(btn.dataset.productStep)));
  document.getElementById('p-step-prev-btn').addEventListener('click',()=>showProductStep(currentProductStep-1));
  document.getElementById('p-step-next-btn').addEventListener('click',()=>{
    const msg=document.getElementById('p-msg');msg.innerHTML='';
    if(currentProductStep===0&&(!document.getElementById('p-code').value.trim()||!document.getElementById('p-name').value.trim())){msg.innerHTML='<div class="msg err">Informe o código e o nome para continuar.</div>';return;}
    if(currentProductStep===1){
      const publicPrice=parseFloat(document.getElementById('p-public-price').value),consigPrice=parseFloat(document.getElementById('p-price').value),consignmentAvailable=!document.getElementById('p-no-consignment').checked,promoRaw=document.getElementById('p-promo-price').value.trim(),promoPrice=parseFloat(promoRaw);
      if(isNaN(publicPrice)||publicPrice<=0||(consignmentAvailable&&(isNaN(consigPrice)||consigPrice<0))){msg.innerHTML=`<div class="msg err">Informe ${consignmentAvailable?'os preços público e de repasse':'um preço público'} válido.</div>`;return;}
      if(consignmentAvailable&&consigPrice>publicPrice){msg.innerHTML='<div class="msg err">O repasse não pode ser maior que o preço ao público.</div>';return;}
      if(promoRaw&&(!Number.isFinite(promoPrice)||promoPrice<=0||promoPrice>=publicPrice)){msg.innerHTML='<div class="msg err">O preço promocional deve ser maior que zero e menor que o preço ao público.</div>';return;}
    }
    showProductStep(currentProductStep+1);
  });
  ['p-public-price','p-price','p-promo-price'].forEach(id=>document.getElementById(id).addEventListener('input',updateProductPricePreview));
  document.getElementById('p-name').addEventListener('blur',event=>{event.target.value=normalizeProductName(event.target.value);updateProductFinalPreview();});
  document.getElementById('p-no-consignment').addEventListener('change',updateConsignmentFieldState);
  document.getElementById('p-cost-calculation').addEventListener('change',renderSelectedCostCalculation);
  document.querySelector('.product-form-shell').addEventListener('input',e=>{if(e.target.id!=='p-template-product'){markProductDirty();updateDescriptionCounter();}});
  document.querySelector('.product-form-shell').addEventListener('change',e=>{if(e.target.id!=='p-template-product')markProductDirty();});
  window.addEventListener('beforeunload',e=>{if(!productFormDirty)return;saveProductDraft();e.preventDefault();e.returnValue='';});
  document.getElementById('p-restore-draft-btn').addEventListener('click',restoreProductDraft);
  document.getElementById('p-discard-draft-btn').addEventListener('click',clearProductDraft);
  document.getElementById('p-quick-preview-btn').addEventListener('click',()=>showProductStep(3));
  document.getElementById('p-quick-video-btn').addEventListener('click',()=>{showProductStep(2);setTimeout(()=>document.getElementById('p-video-upload-btn').focus(),0);});
  document.getElementById('p-use-template-btn').addEventListener('click',()=>{
    const source=PRODUCTS.find(p=>p.code===document.getElementById('p-template-product').value);
    if(!source){alert('Selecione um produto para usar como modelo.');return;}
    if(productFormDirty&&!confirm('Substituir os campos atuais pelos dados do produto selecionado?'))return;
    resetProductForm();
    document.getElementById('p-desc').value=String(source.description||'').replace(CUSTOMIZABLE_NOTE_REGEX,'').trim();
    document.getElementById('p-public-price').value=source.publicPrice!=null?source.publicPrice:'';
    document.getElementById('p-price').value=source.price!=null?source.price:'';
    document.getElementById('p-promo-price').value=source.promoPrice!=null?source.promoPrice:'';
    document.getElementById('p-ondemand').checked=!!source.onDemand;document.getElementById('p-customizable').checked=!!source.customizable;document.getElementById('p-no-consignment').checked=source.consignmentAvailable===false;document.getElementById('p-active').checked=source.active!==false;updateConsignmentFieldState();
    document.getElementById('p-customizable-minqty').value=source.customizableMinQty||'';document.getElementById('p-customizable-minqty-wrap').style.display=source.customizable?'flex':'none';
    pendingCategories=getCategories(source).filter(c=>c!==CUSTOMIZABLE_CATEGORY);renderCategoryPicker();updateProductPricePreview();updateDescriptionCounter();markProductDirty();
    document.getElementById('p-msg').innerHTML='<div class="msg ok">Modelo aplicado. Nome, código e imagens ficaram em branco para evitar duplicações acidentais.</div>';
  });
  updateDescriptionCounter();
  updateDraftNotice();
  document.getElementById('p-refresh-calculations-btn').addEventListener('click',async ()=>{
    const selected=document.getElementById('p-cost-calculation').value;
    const btn=document.getElementById('p-refresh-calculations-btn');
    btn.disabled=true;btn.textContent='Atualizando…';
    CALCULATIONS=await getJSON(CALCULATIONS_KEY,[]);
    renderCostCalculationOptions(selected);
    btn.disabled=false;btn.textContent='Atualizar cálculos';
  });
  document.getElementById('p-use-calculated-price-btn').addEventListener('click',()=>{
    const calc=selectedCostCalculation();
    if(!calc)return;
    const suggested=Number(calc?.result?.precoPorPeca)||0;
    if(suggested<=0){document.getElementById('p-msg').innerHTML='<div class="msg err">Este cálculo não possui um preço sugerido válido.</div>';return;}
    document.getElementById('p-public-price').value=suggested.toFixed(2);
    updateProductPricePreview();updateProductFinalPreview();
  });
  document.getElementById('p-img').addEventListener('input',updateProductImagePreview);
  document.getElementById('p-active').addEventListener('change',updateProductFinalPreview);

  async function setProductImageAsCover(code,url){
    if(!code||!url)return false;
    PRODUCTS=await getJSON('products',PRODUCTS);
    const product=PRODUCTS.find(item=>item.code===code);if(!product||product.image===url)return false;
    const previous=product.image||'';
    product.gallery=(product.gallery||[]).filter(item=>item!==url);
    if(previous&&previous!==url&&!product.gallery.includes(previous))product.gallery.unshift(previous);
    product.image=url;product.updatedAt=Date.now();
    await setJSON('products',PRODUCTS);
    if(editingProductCode===code){document.getElementById('p-img').value=url;pendingGallery=[...product.gallery];updateProductImagePreview();updateProductFinalPreview();renderPendingGallery();}
    renderAdminLists();renderPortfolio();
    return true;
  }

  function renderProductFormColors(){
    const wrap=document.getElementById('p-edit-colors-wrap'),list=document.getElementById('p-edit-colors-list');
    const product=editingProductCode?PRODUCTS.find(item=>item.code===editingProductCode):null;
    const colors=product?(product.colors||[]):pendingColors;
    wrap.style.display=colors.length?'block':'none';
    list.innerHTML=colors.length?colors.map((color,index)=>`
      <div class="list-row" data-product-form-color-row="${index}" style="align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
        <div class="field" style="min-width:130px;"><label>Nome da cor</label><input type="text" data-form-color-name value="${escapeHtml(color.name)}"></div>
        <div class="field" style="max-width:130px;"><label>Estoque</label><input type="number" min="0" data-form-color-stock value="${Math.max(0,Number(color.stock)||0)}"></div>
        <div class="field" style="max-width:150px;"><label>Preço próprio</label><input type="number" min="0.01" step="0.01" data-form-color-price value="${color.publicPrice!=null?Number(color.publicPrice):''}" placeholder="Preço geral"></div>
        <div class="field" style="max-width:150px;"><label>Promoção</label><input type="number" min="0.01" step="0.01" data-form-color-promo value="${color.promoPrice!=null?Number(color.promoPrice):''}" placeholder="Sem promoção"></div>
        <div class="field" style="min-width:210px;flex:2;"><label>Foto da cor</label><input type="url" data-form-color-image value="${escapeHtml(color.image||'')}" placeholder="https://..."></div>
        <span class="actions" style="padding-bottom:2px;"><button type="button" data-form-save-color="${index}">Salvar</button><button type="button" data-form-delete-color="${index}">Remover</button></span>
      </div>`).join(''):`<div class="empty">Nenhuma cor cadastrada. Use “Adicionar nova cor” logo abaixo.</div>`;
  }

  document.getElementById('p-edit-colors-list').addEventListener('click',async event=>{
    const saveButton=event.target.closest('[data-form-save-color]');
    const deleteButton=event.target.closest('[data-form-delete-color]');
    if(!saveButton&&!deleteButton)return;
    const index=Number((saveButton||deleteButton).dataset[saveButton?'formSaveColor':'formDeleteColor']);
    if(editingProductCode)PRODUCTS=await getJSON('products',PRODUCTS);
    const product=editingProductCode?PRODUCTS.find(item=>item.code===editingProductCode):null;
    const colors=product?(product.colors||[]):pendingColors,color=colors[index];
    if(!color)return;
    if(deleteButton){
      if(!confirm(`Remover a cor “${color.name}” e seu estoque deste produto?`))return;
      colors.splice(index,1);
      if(product){product.updatedAt=Date.now();await setJSON('products',PRODUCTS);refreshAdminSelects();renderAdminLists();renderPortfolio();}else markProductDirty();
      renderProductFormColors();return;
    }
    const row=saveButton.closest('[data-product-form-color-row]');
    const newName=row.querySelector('[data-form-color-name]').value.trim();
    const newStock=Math.max(0,parseInt(row.querySelector('[data-form-color-stock]').value)||0);
    const newImage=row.querySelector('[data-form-color-image]').value.trim();
    const priceRaw=row.querySelector('[data-form-color-price]').value.trim(),promoRaw=row.querySelector('[data-form-color-promo]').value.trim();
    const newPrice=priceRaw===''?null:parseFloat(priceRaw),newPromo=promoRaw===''?null:parseFloat(promoRaw);
    const oldName=color.name;
    if(!newName){alert('Informe o nome da cor.');return;}
    if(newImage&&!/^https:\/\//i.test(newImage)){alert('A foto da cor precisa começar com https://.');return;}
    if(newPrice!==null&&(!Number.isFinite(newPrice)||newPrice<=0)){alert('O preço próprio da cor deve ser maior que zero.');return;}
    const base=newPrice??parseFloat(document.getElementById('p-public-price').value);
    if(newPromo!==null&&(!Number.isFinite(newPromo)||newPromo<=0||!Number.isFinite(base)||newPromo>=base)){alert('A promoção deve ser maior que zero e menor que o preço da cor ou do anúncio.');return;}
    if(colors.some((item,itemIndex)=>itemIndex!==index&&item.name.toLowerCase()===newName.toLowerCase())){alert('Já existe outra cor com esse nome neste produto.');return;}
    if(product&&newName!==oldName){
      ENTREGAS=await getJSON('entregas',ENTREGAS);DEVOLUCOES=await getJSON('devolucoes',DEVOLUCOES);ACERTOS=await getJSON('acertos',ACERTOS);PEDIDOS=await getJSON('pedidos',PEDIDOS);VENDAS=await getJSON('vendas',VENDAS);
      ENTREGAS.forEach(item=>{if(item.productCode===product.code&&item.color===oldName)item.color=newName;});
      DEVOLUCOES.forEach(item=>{if(item.productCode===product.code&&item.color===oldName)item.color=newName;});
      ACERTOS.forEach(item=>{if(item.productCode===product.code&&item.color===oldName)item.color=newName;});
      PEDIDOS.forEach(item=>{if(Array.isArray(item.items))item.items.forEach(line=>{if(line.productCode===product.code&&line.color===oldName)line.color=newName;});else if(item.productCode===product.code&&item.color===oldName)item.color=newName;});
      VENDAS.forEach(item=>{if(item.productCode===product.code&&item.color===oldName)item.color=newName;});
      await saveJSONBundle({entregas:ENTREGAS,devolucoes:DEVOLUCOES,acertos:ACERTOS,pedidos:PEDIDOS,vendas:VENDAS},'alteração do nome da variação');
    }
    color.name=newName;color.stock=newStock;color.image=newImage;color.publicPrice=newPrice;color.promoPrice=newPromo;
    if(product){product.updatedAt=Date.now();await setJSON('products',PRODUCTS);refreshAdminSelects();renderAdminLists();renderPortfolio();}else markProductDirty();
    renderProductFormColors();
  });

  document.getElementById('p-form-add-color-btn').addEventListener('click',async()=>{
    const name=document.getElementById('p-first-color-name').value.trim();
    const stock=Math.max(0,parseInt(document.getElementById('p-first-color-stock').value)||0);
    const image=document.getElementById('p-first-color-img').value.trim();
    const priceRaw=document.getElementById('p-first-color-price').value.trim(),promoRaw=document.getElementById('p-first-color-promo').value.trim();
    const publicPrice=priceRaw===''?null:parseFloat(priceRaw),promoPrice=promoRaw===''?null:parseFloat(promoRaw);
    if(!name){alert('Informe o nome da nova cor.');return;}
    if(image&&!/^https:\/\//i.test(image)){alert('A foto da cor precisa começar com https://.');return;}
    if(publicPrice!==null&&(!Number.isFinite(publicPrice)||publicPrice<=0)){alert('O preço próprio da cor deve ser maior que zero.');return;}
    const promoBase=publicPrice??parseFloat(document.getElementById('p-public-price').value);
    if(promoPrice!==null&&(!Number.isFinite(promoPrice)||promoPrice<=0||!Number.isFinite(promoBase)||promoPrice>=promoBase)){alert('A promoção deve ser maior que zero e menor que o preço da cor ou do anúncio.');return;}
    if(editingProductCode)PRODUCTS=await getJSON('products',PRODUCTS);
    const product=editingProductCode?PRODUCTS.find(item=>item.code===editingProductCode):null;
    const colors=product?(product.colors=product.colors||[]):pendingColors;
    if(colors.some(item=>item.name.toLowerCase()===name.toLowerCase())){alert('Essa cor já existe para este produto.');return;}
    colors.push({name,stock,image,publicPrice,promoPrice});
    if(product){product.updatedAt=Date.now();await setJSON('products',PRODUCTS);refreshAdminSelects();renderAdminLists();renderPortfolio();}else markProductDirty();
    ['p-first-color-name','p-first-color-stock','p-first-color-price','p-first-color-promo','p-first-color-img'].forEach(id=>document.getElementById(id).value='');
    renderProductFormColors();
  });

  let stockSearch='',stockCategory='',stockStatus='all',stockSort='low',stockSaveBusy=false;
  function productStockTracked(product){return (product.colors||[]).length>0||Number.isFinite(Number(product.stock));}
  function productTotalStock(product){return (product.colors||[]).length?(product.colors||[]).reduce((sum,color)=>sum+Math.max(0,Number(color.stock)||0),0):Math.max(0,Number(product.stock)||0);}
  function productUnitCost(product){
    if(Number.isFinite(Number(PRODUCT_DIRECT_COSTS[product.code]))&&Number(PRODUCT_DIRECT_COSTS[product.code])>=0)return Number(PRODUCT_DIRECT_COSTS[product.code]);
    const link=productCostLink(product.code),calc=link&&calculationById(link.calculationId);return calc?calcUnitCost(calc):null;
  }
  function productMarginPct(product){const price=Number(product.publicPrice)||0,cost=productUnitCost(product);return price>0&&cost!==null?((price-cost)/price)*100:null;}
  function stockVariants(product){return (product.colors||[]).length?product.colors.map((color,index)=>({color,index,name:color.name||`Variação ${index+1}`,stock:Math.max(0,Number(color.stock)||0),minStock:Number.isFinite(Number(color.minStock))?Math.max(0,Number(color.minStock)):Math.max(0,Number(product.minStock)||3)})):[{color:null,index:-1,name:'Estoque geral',stock:Math.max(0,Number(product.stock)||0),minStock:Math.max(0,Number(product.minStock)||3)}];}
  function stockIsLow(product){return !product.onDemand&&productStockTracked(product)&&stockVariants(product).some(item=>item.stock<=item.minStock);}
  function stockMovementDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
  function renderStockCenter(){
    const list=document.getElementById('stock-list');if(!list)return;
    const categorySelect=document.getElementById('stock-category'),categories=[...new Set(PRODUCTS.flatMap(getCategories))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    categorySelect.innerHTML='<option value="">Todas as categorias</option>'+categories.map(category=>`<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');categorySelect.value=categories.includes(stockCategory)?stockCategory:'';
    const units=PRODUCTS.reduce((sum,p)=>sum+productTotalStock(p),0),low=PRODUCTS.filter(stockIsLow).length,out=PRODUCTS.filter(p=>!p.onDemand&&productStockTracked(p)&&productTotalStock(p)<=0).length,value=PRODUCTS.reduce((sum,p)=>sum+productTotalStock(p)*(productUnitCost(p)||0),0);
    document.getElementById('stock-summary').innerHTML=`<div class="stock-kpi"><small>Unidades disponíveis</small><strong>${units}</strong></div><div class="stock-kpi"><small>Produtos em alerta</small><strong style="color:${low?'var(--coral)':'var(--green)'}">${low}</strong></div><div class="stock-kpi"><small>Produtos esgotados</small><strong>${out}</strong></div><div class="stock-kpi"><small>Custo no estoque</small><strong>${fmtMoney(value)}</strong></div>`;
    const query=normalizeSearch(stockSearch);let rows=PRODUCTS.filter(product=>{
      const variants=stockVariants(product),matchQuery=!query||normalizeSearch([product.name,product.code,getCategories(product).join(' '),variants.map(item=>item.name).join(' ')].join(' ')).includes(query),matchCategory=!stockCategory||getCategories(product).includes(stockCategory),total=productTotalStock(product);
      const matchStatus=stockStatus==='all'||(stockStatus==='low'&&stockIsLow(product))||(stockStatus==='out'&&!product.onDemand&&productStockTracked(product)&&total<=0)||(stockStatus==='available'&&productStockTracked(product)&&total>0)||(stockStatus==='ondemand'&&product.onDemand);return matchQuery&&matchCategory&&matchStatus;
    });
    rows.sort((a,b)=>stockSort==='name'?String(a.name).localeCompare(String(b.name),'pt-BR'):stockSort==='recent'?Number(b.updatedAt||0)-Number(a.updatedAt||0):stockSort==='margin'?(productMarginPct(b)??-Infinity)-(productMarginPct(a)??-Infinity):productTotalStock(a)-productTotalStock(b));
    list.innerHTML=rows.length?rows.map(product=>{
      const variants=stockVariants(product),cost=productUnitCost(product),margin=productMarginPct(product),image=String(product.image||'').replace(/'/g,'%27');
      return `<div class="stock-card ${stockIsLow(product)?'low':''}"><div class="stock-card-head"><div class="stock-product"><span class="stock-thumb" style="${image?`background-image:url('${image}')`:''}">${image?'':'Sem foto'}</span><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.code)} · ${escapeHtml(getCategories(product).join(', ')||'Sem categoria')} · ${product.onDemand?'Sob encomenda':productStockTracked(product)?productTotalStock(product)+' unidade(s)':'Estoque ainda não controlado'}</small></span></div><span class="badge ${stockIsLow(product)?'pendente':'aprovado'}">${product.onDemand?'Sem controle':!productStockTracked(product)?'Iniciar controle':stockIsLow(product)?'Repor estoque':'Estoque regular'}</span></div>
      ${product.onDemand?'<div class="delivery-hint">Produto sob encomenda. Os preços e custos ainda podem ser atualizados abaixo.</div>':`<div class="stock-variants">${variants.map(item=>`<div class="stock-variant"><span><strong>${escapeHtml(item.name)}</strong><small style="display:block;color:var(--muted);">Atual: ${item.stock} · mínimo: ${item.minStock}</small></span><div class="stock-actions"><button data-stock-adjust="${product.code}|${item.index}|-1">−1</button><button data-stock-adjust="${product.code}|${item.index}|1">+1</button><button data-stock-adjust="${product.code}|${item.index}|5">+5</button></div><input type="number" min="0" step="1" value="${item.stock}" data-stock-value="${product.code}|${item.index}" aria-label="Estoque de ${escapeHtml(item.name)}"><button class="btn secondary small" data-stock-set="${product.code}|${item.index}">Aplicar</button></div>`).join('')}</div>`}
      <div class="stock-quick-price"><div class="field"><label>Custo unitário</label><input type="number" min="0" step="0.01" value="${cost===null?'':cost.toFixed(2)}" data-stock-cost="${product.code}" placeholder="Não informado"></div><div class="field"><label>Preço público</label><input type="number" min="0.01" step="0.01" value="${Number(product.publicPrice||0).toFixed(2)}" data-stock-public="${product.code}"></div><div class="field"><label>Repasse</label><input type="number" min="0" step="0.01" value="${Number(product.price||0).toFixed(2)}" data-stock-consignment="${product.code}" ${isConsignmentAvailable(product)?'':'disabled'}></div><div class="field"><label>Estoque mínimo</label><input type="number" min="0" step="1" value="${Math.max(0,Number(product.minStock)||3)}" data-stock-min="${product.code}"></div><button class="btn secondary small" data-stock-save-prices="${product.code}">Salvar valores</button></div><small style="display:block;margin-top:8px;color:var(--muted);">Margem pública: ${margin===null?'não apurada':margin.toFixed(1).replace('.',',')+'%'}${cost===null?' · informe o custo para calcular':' · lucro unitário '+fmtMoney(Math.max(0,Number(product.publicPrice||0)-cost))}</small></div>`;
    }).join(''):'<div class="empty"><div class="glyph">▦</div>Nenhum produto encontrado com estes filtros.</div>';
    const history=STOCK_MOVEMENTS.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,250);
    document.getElementById('stock-history').innerHTML=history.length?history.map(item=>`<div class="stock-history-row"><span>${stockMovementDate(item.at)}</span><strong>${escapeHtml(item.productName||item.productCode)}</strong><span>${escapeHtml(item.color||'Estoque geral')}</span><span style="color:${Number(item.delta)>=0?'var(--green)':'var(--coral)'};font-weight:700;">${Number(item.delta)>0?'+':''}${item.delta} (${item.before} → ${item.after})</span></div>`).join(''):'<div class="empty">Nenhuma movimentação registrada nesta central.</div>';
    list.querySelectorAll('[data-stock-adjust]').forEach(button=>button.addEventListener('click',()=>{const [code,index,delta]=button.dataset.stockAdjust.split('|');changeQuickStock(code,Number(index),null,Number(delta));}));
    list.querySelectorAll('[data-stock-set]').forEach(button=>button.addEventListener('click',()=>{const [code,index]=button.dataset.stockSet.split('|'),input=list.querySelector(`[data-stock-value="${CSS.escape(code+'|'+index)}"]`);changeQuickStock(code,Number(index),Math.max(0,Math.floor(Number(input?.value)||0)),null);}));
    list.querySelectorAll('[data-stock-save-prices]').forEach(button=>button.addEventListener('click',()=>saveQuickProductValues(button.dataset.stockSavePrices)));
  }
  async function changeQuickStock(code,index,target,delta){
    if(stockSaveBusy)return;const latest=await getJSON('products',PRODUCTS),product=latest.find(item=>item.code===code);if(!product)return;
    const color=index>=0?(product.colors||[])[index]:null,wasTracked=!!color||Number.isFinite(Number(product.stock)),before=Math.max(0,Number(color?color.stock:product.stock)||0),after=target===null?Math.max(0,before+delta):target;if(after===before&&wasTracked)return;
    if(color)color.stock=after;else product.stock=after;product.updatedAt=Date.now();const movement={id:`MOV-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,at:new Date().toISOString(),productCode:product.code,productName:product.name,color:color?.name||'',before,after,delta:after-before,type:after>before?'Entrada':'Saída / ajuste'};
    stockSaveBusy=true;try{const history=await getJSON(STOCK_MOVEMENTS_KEY,STOCK_MOVEMENTS),nextHistory=[...history,movement];await saveJSONBundle({products:latest,[STOCK_MOVEMENTS_KEY]:nextHistory},'atualização de estoque');PRODUCTS=latest;STOCK_MOVEMENTS=nextHistory;renderStockCenter();renderPortfolio();}catch(error){document.getElementById('stock-msg').innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;}finally{stockSaveBusy=false;}
  }
  async function saveQuickProductValues(code){
    if(stockSaveBusy)return;const product=PRODUCTS.find(item=>item.code===code);if(!product)return;const rootCard=document.querySelector(`[data-stock-save-prices="${CSS.escape(code)}"]`)?.closest('.stock-card');
    const cost=Number(rootCard?.querySelector(`[data-stock-cost="${CSS.escape(code)}"]`)?.value),publicPrice=Number(rootCard?.querySelector(`[data-stock-public="${CSS.escape(code)}"]`)?.value),price=Number(rootCard?.querySelector(`[data-stock-consignment="${CSS.escape(code)}"]`)?.value),minStock=Math.max(0,Math.floor(Number(rootCard?.querySelector(`[data-stock-min="${CSS.escape(code)}"]`)?.value)||0));
    if(!Number.isFinite(publicPrice)||publicPrice<=0||!Number.isFinite(cost)||cost<0||(isConsignmentAvailable(product)&&(!Number.isFinite(price)||price<0||price>publicPrice))){document.getElementById('stock-msg').innerHTML='<div class="msg err">Confira custo, preço público e repasse. O repasse não pode superar o preço público.</div>';return;}
    stockSaveBusy=true;try{const latest=await getJSON('products',PRODUCTS),costs=await getJSON(PRODUCT_DIRECT_COSTS_KEY,PRODUCT_DIRECT_COSTS),target=latest.find(item=>item.code===code);target.publicPrice=publicPrice;if(isConsignmentAvailable(target))target.price=price;target.minStock=minStock;(target.colors||[]).forEach(color=>{color.minStock=minStock;});target.updatedAt=Date.now();costs[code]=cost;await saveJSONBundle({products:latest,[PRODUCT_DIRECT_COSTS_KEY]:costs},'atualização de custos e preços');PRODUCTS=latest;PRODUCT_DIRECT_COSTS=costs;document.getElementById('stock-msg').innerHTML='<div class="msg ok">Custos, preços e estoque mínimo atualizados.</div>';renderStockCenter();renderPortfolio();renderAdminLists();}catch(error){document.getElementById('stock-msg').innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;}finally{stockSaveBusy=false;}
  }
  ['stock-search','stock-category','stock-status','stock-sort'].forEach(id=>document.getElementById(id).addEventListener(id==='stock-search'?'input':'change',event=>{if(id==='stock-search')stockSearch=event.target.value;if(id==='stock-category')stockCategory=event.target.value;if(id==='stock-status')stockStatus=event.target.value;if(id==='stock-sort')stockSort=event.target.value;renderStockCenter();}));
  document.getElementById('stock-export-btn').addEventListener('click',()=>{const rows=[['Data','Produto','Código','Cor','Anterior','Novo','Variação','Tipo'],...STOCK_MOVEMENTS.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(item=>[stockMovementDate(item.at),item.productName,item.productCode,item.color||'Estoque geral',item.before,item.after,item.delta,item.type])],csv=rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(';')).join('\n'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`historico_estoque_${todayISO()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

  function renderAdminLists(){
    renderDocList();
    const adminProducts=filteredAdminProducts();
    const activeCount=PRODUCTS.filter(p=>p.active!==false).length,archivedCount=PRODUCTS.length-activeCount,noImageCount=PRODUCTS.filter(p=>!p.image).length;
    const summary=document.getElementById('admin-product-summary');
    if(summary)summary.innerHTML=`<span>${adminProducts.length} exibido${adminProducts.length===1?'':'s'}</span><span>${activeCount} publicado${activeCount===1?'':'s'}</span><span>${archivedCount} arquivado${archivedCount===1?'':'s'}</span><span>${noImageCount} sem imagem</span>`;
    document.getElementById('p-list').innerHTML = adminProducts.length ? adminProducts.map(p=>{
      const colors = p.colors || [];
      const gallery = p.gallery || [];
      const isExpanded = expandedProductCode === p.code;
      const colorChips = colors.map(c=>{
        const key = `${p.code}|${c.name}`;
        if(editingColorKey === key){
          return `
          <span class="color-chip color-chip-editing">
            <input type="text" data-edit-color-name="${key}" value="${c.name.replace(/"/g,'&quot;')}" placeholder="Nome da cor" style="width:110px;">
            <input type="text" data-edit-color-image="${key}" value="${(c.image||'').replace(/"/g,'&quot;')}" placeholder="URL da foto (opcional)" style="width:180px;">
            <input type="number" min="0.01" step="0.01" data-edit-color-price="${key}" value="${c.publicPrice!=null?Number(c.publicPrice):''}" placeholder="Preço próprio" style="width:120px;">
            <input class="upload-file-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-edit-color-file="${key}">
            <button data-upload-edit-color="${key}" title="Enviar uma foto para esta cor">📷 Enviar foto</button>
            <button data-save-color="${key}" title="Salvar alterações">✓ Salvar</button>
            <button data-cancel-edit-color="${key}" title="Cancelar">Cancelar</button>
          </span>`;
        }
        const colorPromoInfo = getPromoInfo(p, c.name);
        return `
        <span class="color-chip ${Number(c.stock)<=0?'out':''}">
          ${c.image ? '📷 ' : ''}${c.name} · <strong>${c.stock}</strong>
          ${c.publicPrice!=null&&Number(c.publicPrice)>0 ? ` · ${fmtMoney(c.publicPrice)}` : ' · preço geral'}
          ${colorPromoInfo ? ` · 🔥 <s>${fmtMoney(colorPromoInfo.base)}</s> ${fmtMoney(colorPromoInfo.promo)}` : ''}
          <button data-adj-color="${p.code}|${c.name}|-1" title="Diminuir 1 do estoque">−</button>
          <button data-adj-color="${p.code}|${c.name}|1" title="Aumentar 1 no estoque">+</button>
          <button data-edit-color="${key}" title="Editar nome/foto desta cor">✏️</button>
          <button data-promo-color="${p.code}|${c.name}" title="${colorPromoInfo ? 'Editar/remover promoção desta cor' : 'Colocar esta cor em promoção'}">🔥</button>
          <button data-del-color="${p.code}|${c.name}" title="Remover esta cor">✕</button>
        </span>`;
      }).join('');
      const galleryChips = gallery.map((url,gi)=>`
        <div class="admin-gallery-item"><div class="admin-gallery-thumb" style="background-image:url('${String(url).replace(/'/g,'%27')}')"><span class="admin-gallery-index">Foto ${gi+1}</span></div>
          <div class="admin-gallery-actions"><button data-set-gallery-cover="${p.code}|${gi}" title="Trocar a capa sem excluir a atual">★ Tornar capa</button><button data-move-gallery="${p.code}|${gi}|-1" title="Mover para a esquerda" ${gi===0?'disabled':''}>←</button><button data-del-gallery="${p.code}|${gi}" title="Remover da galeria">✕</button><button data-move-gallery="${p.code}|${gi}|1" title="Mover para a direita" ${gi===gallery.length-1?'disabled':''}>→</button></div>
        </div>`).join('');
      const bulkPromoInfo = getPromoInfo(p);
      const consignmentLabel=isConsignmentAvailable(p)?`Consignado: ${fmtMoney(p.price)}`:'Somente venda direta';
      const priceLine = bulkPromoInfo
        ? `Público: <s>${fmtMoney(bulkPromoInfo.base)}</s> 🔥 ${fmtMoney(bulkPromoInfo.promo)} (-${bulkPromoInfo.pct}%) · ${consignmentLabel}`
        : `Público: ${p.publicPrice!=null ? fmtMoney(p.publicPrice) : '—'} · ${consignmentLabel}`;
      const costLink=productCostLink(p.code),linkedCalc=costLink&&calculationById(costLink.calculationId);
      const unitCost=productUnitCost(p);
      const hlMargin=unitCost!==null&&Number(p.price)>0?((Number(p.price)-unitCost)/Number(p.price))*100:null;
      const costStale=!!(linkedCalc&&String(costLink.calculationUpdatedAt||'')!==String(linkedCalc.updatedAt||linkedCalc.createdAt||''));
      const costLine=unitCost!==null
        ? ` · Custo: ${fmtMoney(unitCost)} · Margem HL: ${hlMargin===null?'—':hlMargin.toFixed(1).replace('.',',')+'%'}${costStale?' · ⚠ cálculo atualizado':''}`
        : ' · custo não informado';
      const catsLine = getCategories(p).join(', ') || 'sem categoria';
      return `
      <div class="list-row product-admin-row ${p.active===false?'archived':''}" style="flex-direction:column;align-items:stretch;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;cursor:pointer;" data-toggle-product="${p.code}">
          <span class="product-admin-main"><span style="display:inline-block;transition:transform .15s;transform:rotate(${isExpanded?90:0}deg);">▸</span><span class="product-admin-thumb" style="${p.image?`background-image:url('${String(p.image).replace(/'/g,'%27')}')`:''}"></span><span class="product-admin-title"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.code)} · ${escapeHtml(catsLine)} · ${priceLine}${costLine}${!p.image?' · ⚠ SEM IMAGEM':''}${p.active===false?' · ARQUIVADO':''}</small></span></span>
          <span class="actions">
            <button data-edit-product="${p.code}">Editar</button>
            <button data-duplicate-product="${p.code}">Duplicar</button>
            <button data-toggle-active-product="${p.code}">${p.active===false?'Publicar':'Arquivar'}</button>
            <button data-del-product="${p.code}" class="danger-action">Excluir</button>
          </span>
        </div>
        <div style="display:${isExpanded ? 'flex' : 'none'};flex-direction:column;gap:8px;">
          ${colors.length ? `<div class="color-chips">${colorChips}</div>` : `<div style="color:var(--muted);font-size:11px;">Sem variações de cor cadastradas — este item não usa controle de estoque.</div>`}
          <div class="color-add-row">
            <input type="text" placeholder="Nova cor (ex: Azul)" data-color-name-input="${p.code}">
            <input type="number" min="0" placeholder="Estoque inicial" data-color-stock-input="${p.code}">
            <input type="text" placeholder="URL da foto desta cor (opcional)" data-color-image-input="${p.code}" style="flex:1;min-width:160px;">
            <input class="upload-file-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-color-image-file="${p.code}">
            <button data-upload-color-image="${p.code}">📷 Enviar foto</button>
            <input type="number" step="0.01" min="0.01" placeholder="Preço próprio (opcional)" data-color-price-input="${p.code}" style="max-width:160px;">
            <input type="number" step="0.01" min="0" placeholder="🔥 Preço promo (opcional)" data-color-promo-input="${p.code}" style="max-width:150px;">
            <button data-add-color="${p.code}">+ Adicionar cor</button>
          </div>
          <div style="border-top:1px solid var(--line);margin-top:4px;padding-top:8px;">
            <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;font-family:'IBM Plex Mono';margin-bottom:6px;">Fotos secundárias (galeria)</div>
            ${gallery.length ? `<div class="admin-gallery-grid">${galleryChips}</div>` : ''}
            <textarea placeholder="Cole uma ou várias URLs de foto, uma por linha" data-gallery-input="${p.code}" rows="3" style="width:100%;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);padding:8px 10px;border-radius:8px;font-size:12px;font-family:'Inter';resize:vertical;box-sizing:border-box;"></textarea>
            <div class="image-upload-actions" style="margin-top:6px;"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-gallery-file-upload="${p.code}"><button data-upload-gallery="${p.code}">📷 Enviar fotos</button><button data-add-gallery="${p.code}">+ Adicionar pelos links</button><span class="upload-status" data-gallery-upload-status="${p.code}"></span></div>
          </div>
        </div>
      </div>`;
    }).join('') : `<div class="empty">Nenhum produto encontrado com os filtros selecionados.</div>`;

    root.querySelectorAll('[data-toggle-product]').forEach(el=>el.addEventListener('click', (e)=>{
      if(e.target.closest('.actions')) return; // não expande/recolhe se clicou nos botões de ação
      const code = el.dataset.toggleProduct;
      expandedProductCode = expandedProductCode === code ? null : code;
      renderAdminLists();
    }));

    root.querySelectorAll('[data-toggle-ondemand]').forEach(btn=>btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const code = btn.dataset.toggleOndemand;
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      if(!p) return;
      p.onDemand = !p.onDemand;
      await setJSON('products', PRODUCTS);
      renderAdminLists(); renderPortfolio();
    }));

    root.querySelectorAll('[data-toggle-active-product]').forEach(btn=>btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      PRODUCTS=await getJSON('products',PRODUCTS);
      const p=PRODUCTS.find(item=>item.code===btn.dataset.toggleActiveProduct);
      if(!p)return;
      p.active=p.active===false;
      p.updatedAt=Date.now();
      await setJSON('products',PRODUCTS);
      refreshAdminSelects();renderAdminLists();renderPortfolio();
    }));

    root.querySelectorAll('[data-duplicate-product]').forEach(btn=>btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      PRODUCTS=await getJSON('products',PRODUCTS);
      const source=PRODUCTS.find(item=>item.code===btn.dataset.duplicateProduct);
      if(!source)return;
      const prefixMatch=String(source.code||'').match(/^[A-Z]+/),prefix=prefixMatch?prefixMatch[0]:'PRO';
      const copy=JSON.parse(JSON.stringify(source));
      copy.code=nextCodeForPrefix(prefix);
      copy.name=`${source.name} — cópia`;
      copy.active=false;
      copy.colors=(copy.colors||[]).map(color=>({...color,stock:0}));
      copy.createdAt=Date.now();
      copy.updatedAt=Date.now();
      PRODUCTS.push(copy);
      await setJSON('products',PRODUCTS);
      PRODUCT_DIRECT_COSTS=await getJSON(PRODUCT_DIRECT_COSTS_KEY,PRODUCT_DIRECT_COSTS);if(Object.prototype.hasOwnProperty.call(PRODUCT_DIRECT_COSTS,source.code)){PRODUCT_DIRECT_COSTS[copy.code]=PRODUCT_DIRECT_COSTS[source.code];await setJSON(PRODUCT_DIRECT_COSTS_KEY,PRODUCT_DIRECT_COSTS);}
      adminProductStatus='archived';
      document.getElementById('admin-product-status').value='archived';
      renderAdminLists();
      const editButton=root.querySelector(`[data-edit-product="${copy.code}"]`);
      if(editButton)editButton.click();
    }));

    root.querySelectorAll('[data-edit-product]').forEach(btn=>btn.addEventListener('click', ()=>{
      const p = PRODUCTS.find(p=>p.code===btn.dataset.editProduct);
      if(!p) return;
      if(productFormDirty&&!confirm('Descartar o preenchimento atual e abrir este produto para edição?'))return;
      clearProductDraft();
      editingProductCode = p.code;
      pendingCategories = [...getCategories(p)];
      pendingGallery = [...(p.gallery||[])];
      pendingColors = [];
      document.getElementById('p-code').value = p.code;
      document.getElementById('p-code').disabled = false;
      const detectedPrefix = (p.code || '').match(/^[A-Z]+/);
      const prefixSelect = document.getElementById('p-prefix');
      prefixSelect.value = detectedPrefix && [...prefixSelect.options].some(o=>o.value===detectedPrefix[0]) ? detectedPrefix[0] : '';
      document.getElementById('p-name').value = p.name || '';
      document.getElementById('p-public-price').value = p.publicPrice != null ? p.publicPrice : '';
      document.getElementById('p-promo-price').value = p.promoPrice != null ? p.promoPrice : '';
      document.getElementById('p-price').value = p.price != null ? p.price : '';
      document.getElementById('p-img').value = p.image || '';
      document.getElementById('p-video').value = p.video || '';
      document.getElementById('p-video-sound').checked = p.videoMuted === false;
      document.getElementById('p-desc').value = p.description || '';
      document.getElementById('p-ondemand').checked = !!p.onDemand;
      document.getElementById('p-customizable').checked = !!p.customizable;
      document.getElementById('p-no-consignment').checked = p.consignmentAvailable === false;
      updateConsignmentFieldState();
      document.getElementById('p-active').checked = p.active !== false;
      document.getElementById('p-customizable-minqty').value = p.customizableMinQty != null ? p.customizableMinQty : '';
      document.getElementById('p-customizable-minqty-wrap').style.display = p.customizable ? 'flex' : 'none';
      document.getElementById('p-first-color-wrap').style.display = 'block';
      document.getElementById('p-form-add-color-btn').style.display = 'inline-flex';
      document.getElementById('p-color-form-title').textContent = 'Adicionar cor ou variação';
      document.getElementById('p-color-form-help').textContent = 'Cadastre nome, estoque, foto e um preço próprio opcional.';
      renderProductFormColors();
      document.getElementById('p-form-title').textContent = `Editando: ${p.code} — ${p.name}`;
      document.getElementById('p-form-status').textContent = p.active===false ? 'Produto arquivado' : 'Produto publicado';
      document.getElementById('p-add-btn').textContent = 'Salvar alterações';
      document.getElementById('p-cancel-edit-btn').style.display = 'inline-block';
      document.getElementById('p-msg').innerHTML = '';
      renderCategoryPicker();
      renderPendingGallery();
      const costLink=productCostLink(p.code);
      renderCostCalculationOptions(costLink?.calculationId||'');
      updateProductPricePreview();updateProductImagePreview();updateDescriptionCounter();showProductStep(0);productFormDirty=false;
      document.querySelector('.admin-tab[data-tab="produtos"] .panel').scrollIntoView({ behavior:'smooth', block:'start' });
    }));

    root.querySelectorAll('[data-upload-color-image]').forEach(btn=>btn.addEventListener('click',()=>root.querySelector(`[data-color-image-file="${btn.dataset.uploadColorImage}"]`).click()));
    root.querySelectorAll('[data-color-image-file]').forEach(input=>input.addEventListener('change',async ()=>{
      const code=input.dataset.colorImageFile,file=input.files?.[0];if(!file)return;
      const button=root.querySelector(`[data-upload-color-image="${code}"]`),target=root.querySelector(`[data-color-image-input="${code}"]`);
      button.disabled=true;button.textContent='Otimizando…';
      try{target.value=await uploadProductImage(file,'variacoes',code);button.textContent='✓ Foto enviada';}
      catch(error){alert(error.message||'Não foi possível enviar a foto.');button.textContent='📷 Enviar foto';}
      finally{button.disabled=false;input.value='';}
    }));
    root.querySelectorAll('[data-upload-edit-color]').forEach(btn=>btn.addEventListener('click',()=>root.querySelector(`[data-edit-color-file="${btn.dataset.uploadEditColor}"]`).click()));
    root.querySelectorAll('[data-edit-color-file]').forEach(input=>input.addEventListener('change',async ()=>{
      const key=input.dataset.editColorFile,file=input.files?.[0];if(!file)return;
      const code=key.split('|')[0],button=root.querySelector(`[data-upload-edit-color="${key}"]`),target=root.querySelector(`[data-edit-color-image="${key}"]`);
      button.disabled=true;button.textContent='Otimizando…';
      try{target.value=await uploadProductImage(file,'variacoes',code);button.textContent='✓ Enviada';}
      catch(error){alert(error.message||'Não foi possível enviar a foto.');button.textContent='📷 Enviar foto';}
      finally{button.disabled=false;input.value='';}
    }));
    root.querySelectorAll('[data-upload-gallery]').forEach(btn=>btn.addEventListener('click',()=>root.querySelector(`[data-gallery-file-upload="${btn.dataset.uploadGallery}"]`).click()));
    root.querySelectorAll('[data-gallery-file-upload]').forEach(input=>input.addEventListener('change',async ()=>{
      const code=input.dataset.galleryFileUpload,files=[...(input.files||[])];if(!files.length)return;
      const button=root.querySelector(`[data-upload-gallery="${code}"]`),status=root.querySelector(`[data-gallery-upload-status="${code}"]`);
      button.disabled=true;let uploaded=0,urls=[];
      try{
        for(const file of files){status.textContent=`Otimizando ${uploaded+1} de ${files.length}…`;urls.push(await uploadProductImage(file,'galeria',code));uploaded++;}
        PRODUCTS=await getJSON('products',PRODUCTS);
        const product=PRODUCTS.find(item=>item.code===code);if(!product)throw new Error('Produto não encontrado.');
        product.gallery=product.gallery||[];urls.forEach(url=>{if(!product.gallery.includes(url))product.gallery.push(url);});product.updatedAt=Date.now();
        await setJSON('products',PRODUCTS);renderAdminLists();renderPortfolio();
      }catch(error){status.textContent=error.message||'Falha no envio.';button.disabled=false;input.value='';return;}
    }));

    root.querySelectorAll('[data-add-gallery]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const code = btn.dataset.addGallery;
      const input = root.querySelector(`[data-gallery-input="${code}"]`);
      const urls = input.value.split('\n').map(u=>u.trim()).filter(Boolean);
      if(urls.length === 0) return;
      if(urls.some(url=>!/^https:\/\//i.test(url))){alert('Todas as fotos da galeria precisam começar com https://.');return;}
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      if(!p) return;
      p.gallery = p.gallery || [];
      urls.forEach(url=>{
        if(!p.gallery.includes(url)) p.gallery.push(url);
      });
      await setJSON('products', PRODUCTS);
      renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-set-gallery-cover]').forEach(btn=>btn.addEventListener('click',async()=>{
      const [code,indexRaw]=btn.dataset.setGalleryCover.split('|');
      const product=PRODUCTS.find(item=>item.code===code),url=product?.gallery?.[Number(indexRaw)];if(!url)return;
      btn.disabled=true;btn.textContent='Trocando…';
      try{await setProductImageAsCover(code,url);}catch(error){alert(error.message||'Não foi possível trocar a imagem principal.');btn.disabled=false;btn.textContent='★ Tornar capa';}
    }));
    root.querySelectorAll('[data-del-gallery]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const [code, idxStr] = btn.dataset.delGallery.split('|');
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      if(!p) return;
      p.gallery = (p.gallery||[]).filter((_,i)=>i!==Number(idxStr));
      await setJSON('products', PRODUCTS);
      renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-move-gallery]').forEach(btn=>btn.addEventListener('click',async ()=>{
      const [code,indexRaw,deltaRaw]=btn.dataset.moveGallery.split('|'),index=Number(indexRaw),target=index+Number(deltaRaw);
      PRODUCTS=await getJSON('products',PRODUCTS);
      const product=PRODUCTS.find(item=>item.code===code);if(!product||target<0||target>=(product.gallery||[]).length)return;
      [product.gallery[index],product.gallery[target]]=[product.gallery[target],product.gallery[index]];product.updatedAt=Date.now();
      await setJSON('products',PRODUCTS);renderAdminLists();renderPortfolio();
    }));

    root.querySelectorAll('[data-add-color]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const code = btn.dataset.addColor;
      const nameInput = root.querySelector(`[data-color-name-input="${code}"]`);
      const stockInput = root.querySelector(`[data-color-stock-input="${code}"]`);
      const imageInput = root.querySelector(`[data-color-image-input="${code}"]`);
      const priceInput = root.querySelector(`[data-color-price-input="${code}"]`);
      const promoInput = root.querySelector(`[data-color-promo-input="${code}"]`);
      const name = nameInput.value.trim();
      const stock = Math.max(0, parseInt(stockInput.value) || 0);
      const image = imageInput.value.trim();
      const priceRaw=priceInput.value.trim();
      const publicPrice=priceRaw===''?null:parseFloat(priceRaw);
      const promoRaw = promoInput.value.trim();
      const promoPrice = promoRaw === '' ? null : parseFloat(promoRaw);
      if(!name) return;
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      if(!p) return;
      if(publicPrice!==null&&(!Number.isFinite(publicPrice)||publicPrice<=0)){alert('O preço próprio da cor deve ser maior que zero.');return;}
      const base=publicPrice??Number(p.publicPrice);
      if(promoPrice!==null&&(!Number.isFinite(promoPrice)||promoPrice<=0||promoPrice>=base)){alert('A promoção da cor deve ser maior que zero e menor que o preço ao público.');return;}
      if(image&&!/^https:\/\//i.test(image)){alert('A foto da cor precisa começar com https://.');return;}
      p.colors = p.colors || [];
      if(p.colors.some(c=>c.name.toLowerCase()===name.toLowerCase())){
        alert('Essa cor já existe para este produto.'); return;
      }
      p.colors.push({name, stock, image, publicPrice, promoPrice});
      await setJSON('products', PRODUCTS);
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-edit-color]').forEach(btn=>btn.addEventListener('click', ()=>{
      editingColorKey = btn.dataset.editColor;
      renderAdminLists();
    }));
    root.querySelectorAll('[data-cancel-edit-color]').forEach(btn=>btn.addEventListener('click', ()=>{
      editingColorKey = null;
      renderAdminLists();
    }));
    root.querySelectorAll('[data-save-color]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const key = btn.dataset.saveColor;
      const [code, oldName] = key.split('|');
      const nameInput = root.querySelector(`[data-edit-color-name="${key}"]`);
      const imageInput = root.querySelector(`[data-edit-color-image="${key}"]`);
      const priceInput = root.querySelector(`[data-edit-color-price="${key}"]`);
      const newName = nameInput.value.trim();
      const newImage = imageInput.value.trim();
      const priceRaw=priceInput.value.trim(),newPrice=priceRaw===''?null:parseFloat(priceRaw);
      if(!newName){ alert('O nome da cor não pode ficar em branco.'); return; }
      if(newImage&&!/^https:\/\//i.test(newImage)){alert('A foto da cor precisa começar com https://.');return;}
      if(newPrice!==null&&(!Number.isFinite(newPrice)||newPrice<=0)){alert('O preço próprio da cor deve ser maior que zero.');return;}

      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      if(!p) return;
      const c = (p.colors||[]).find(c=>c.name===oldName);
      if(!c) return;

      const nameChanged = newName !== oldName;
      if(nameChanged && p.colors.some(other=>other!==c && other.name.toLowerCase()===newName.toLowerCase())){
        alert('Já existe outra cor com esse nome neste produto.'); return;
      }

      if(nameChanged){
        // atualiza em cascata os registros que referenciam o nome antigo desta cor, pra manter o histórico consistente
        ENTREGAS = await getJSON('entregas', ENTREGAS);
        DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
        ACERTOS = await getJSON('acertos', ACERTOS);
        PEDIDOS = await getJSON('pedidos', PEDIDOS);
        VENDAS = await getJSON('vendas', VENDAS);
        ENTREGAS.forEach(e=>{ if(e.productCode===code && e.color===oldName) e.color = newName; });
        DEVOLUCOES.forEach(d=>{ if(d.productCode===code && d.color===oldName) d.color = newName; });
        ACERTOS.forEach(a=>{ if(a.productCode===code && a.color===oldName) a.color = newName; });
        PEDIDOS.forEach(r=>{ if(Array.isArray(r.items))r.items.forEach(item=>{if(item.productCode===code&&item.color===oldName)item.color=newName;});else if(r.productCode===code&&r.color===oldName)r.color=newName; });
        VENDAS.forEach(v=>{if(v.productCode===code&&v.color===oldName)v.color=newName;});
        await saveJSONBundle({entregas:ENTREGAS,devolucoes:DEVOLUCOES,acertos:ACERTOS,pedidos:PEDIDOS,vendas:VENDAS},'alteração do nome da variação');
        c.name = newName;
      }
      c.image = newImage;c.publicPrice=newPrice;
      if(c.promoPrice!=null&&Number(c.promoPrice)>=getPublicPrice(p,newName))c.promoPrice=null;

      await setJSON('products', PRODUCTS);
      editingColorKey = null;
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-promo-color]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const [code, colorName] = btn.dataset.promoColor.split('|');
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      const c = p && (p.colors||[]).find(c=>c.name===colorName);
      if(!c) return;
      const base = getPublicPrice(p,colorName);
      const current = c.promoPrice != null ? c.promoPrice : '';
      const answer = window.prompt(`Preço promocional para a cor "${colorName}" (preço ao público atual: ${fmtMoney(base)}).\nDeixe em branco pra remover a promoção desta cor.`, current);
      if(answer === null) return; // cancelou
      const trimmed = answer.trim();
      const value=trimmed===''?null:parseFloat(trimmed);
      if(value!==null&&(!Number.isFinite(value)||value<=0||value>=Number(base))){alert('A promoção deve ser maior que zero e menor que o preço ao público.');return;}
      c.promoPrice = value;
      await setJSON('products', PRODUCTS);
      renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-adj-color]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const [code, colorName, delta] = btn.dataset.adjColor.split('|');
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      const c = p && (p.colors||[]).find(c=>c.name===colorName);
      if(!c) return;
      c.stock = Math.max(0, Number(c.stock) + parseInt(delta));
      await setJSON('products', PRODUCTS);
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-del-color]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const [code, colorName] = btn.dataset.delColor.split('|');
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===code);
      if(!p) return;
      p.colors = (p.colors||[]).filter(c=>c.name!==colorName);
      await setJSON('products', PRODUCTS);
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));

    document.getElementById('c-list').innerHTML = CLIENTS.length ? CLIENTS.map(c=>`
      <div class="list-row" id="client-row-${c.code}" style="flex-direction:column;align-items:stretch;gap:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span class="mono">${c.code} — ${escapeHtml(c.name)} — ${escapeHtml(c.contact)||'sem contato'}${c.responsavel ? ' · resp.: '+escapeHtml(c.responsavel) : ''}${c.document ? ' · '+escapeHtml(c.document) : ''} · <span class="badge ${c.pinConfigured?'aprovado':'pendente'}">${c.pinConfigured?'Acesso configurado':c.activationPending?'Aguardando ativação':'Acesso pendente'}</span></span>
          <span class="actions"><button data-new-activation="${c.code}">Novo código de acesso</button><button data-edit-client="${c.code}">Editar</button><button data-del-client="${c.code}">Remover</button></span>
        </div>
        ${c.notes ? `<div style="color:var(--muted);font-size:11px;white-space:pre-wrap;">${escapeHtml(c.notes)}</div>` : ''}
      </div>
    `).join('') : `<div class="empty">Nenhum cliente cadastrado.</div>`;

    document.getElementById('e-list').innerHTML = ENTREGAS.slice().reverse().slice(0,8).map(e=>`
      <div class="list-row"><span class="mono">${e.id} · ${fmtDate(e.date)} · ${clientLinkHtml(e.clientCode)} · ${e.qty}x ${productName(e.productCode)}${e.color ? ' ('+e.color+')' : ''}</span>
      <span class="actions"><button data-del-entrega="${e.id}">Remover</button></span></div>
    `).join('') || `<div class="empty">Nenhuma entrega registrada.</div>`;

    document.getElementById('d-list').innerHTML = DEVOLUCOES.slice().reverse().slice(0,8).map(d=>`
      <div class="list-row"><span class="mono">${d.id} · ${fmtDate(d.date)} · ${clientLinkHtml(d.clientCode)} · ${d.qty}x ${productName(d.productCode)}${d.color ? ' ('+d.color+')' : ''} · ${d.state}</span>
      <span class="actions"><button data-del-devolucao="${d.id}">Remover</button></span></div>
    `).join('') || `<div class="empty">Nenhuma devolução registrada.</div>`;

    document.getElementById('a-list').innerHTML = ACERTOS.slice().reverse().slice(0,8).map(a=>`
      <div class="list-row"><span class="mono">${a.id} · ${fmtDate(a.date)} · ${clientLinkHtml(a.clientCode)} · ${a.qty}x ${productName(a.productCode)}${a.color ? ' ('+a.color+')' : ''}</span>
      <span class="actions"><span class="badge ${a.status.toLowerCase()}">${a.status}</span><button data-del-acerto="${a.id}">Remover</button></span></div>
    `).join('') || `<div class="empty">Nenhum acerto registrado.</div>`;

    document.getElementById('v-list').innerHTML = VENDAS.slice().reverse().slice(0,8).map(v=>`
      <div class="list-row"><span class="mono">${v.id} · ${fmtDate(v.date)} · ${clientLinkHtml(v.clientCode)} · ${v.qty}x ${productName(v.productCode)}${v.color ? ' ('+v.color+')' : ''} · ${fmtMoney(v.total)}${v.obs ? ' · '+escapeHtml(v.obs) : ''}</span>
      <span class="actions"><span class="badge pago">Pago</span><button data-del-venda="${v.id}">Remover</button></span></div>
    `).join('') || `<div class="empty">Nenhuma venda direta registrada.</div>`;

    const pendentes = PEDIDOS.filter(r=>r.status==='Pendente');
    const badge = document.getElementById('pedidos-badge');
    if(pendentes.length){ badge.style.display='inline-block'; badge.textContent = pendentes.length; }
    else { badge.style.display='none'; }

    const statusClass = { Pendente:'pendente', Aprovado:'aprovado', Recusado:'recusado' };
    document.getElementById('req-list').innerHTML = PEDIDOS.length ? PEDIDOS.slice().reverse().map(r=>`
      <div class="list-row">
        <span class="mono">${r.id} · ${fmtDate(r.date)} · ${clientLinkHtml(r.clientCode)}<br>${requestItemsHtml(r)}${r.note ? '<br>Observação: "'+escapeHtml(r.note)+'"' : ''}</span>
        <span class="actions">
          ${requestHasProduction(r) ? '<span class="badge acerto" style="margin-right:6px;">Inclui produção</span>' : ''}
          <span class="badge ${statusClass[r.status]}" style="margin-right:6px;">${r.status}</span>
          ${r.status==='Pendente' ? `<button data-approve-req="${r.id}">Aprovar</button><button data-refuse-req="${r.id}">Recusar</button>` : ''}
          <button data-del-pedido="${r.id}">Remover</button>
        </span>
      </div>
    `).join('') : `<div class="empty">Nenhum pedido de reposição por enquanto.</div>`;

    const saleReports=PARTNER_ACTIONS.filter(a=>a.type==='sale_report').slice().reverse();
    const pendingSaleReports=saleReports.filter(r=>r.status==='Pendente').length,saleBadge=document.getElementById('partner-sales-badge');
    saleBadge.style.display=pendingSaleReports?'inline-block':'none';saleBadge.textContent=pendingSaleReports;
    document.getElementById('partner-sales-admin-list').innerHTML=saleReports.length?saleReports.map(r=>`<div class="list-row"><span class="mono">${r.id} · ${fmtDate(r.date)} · ${clientLinkHtml(r.clientCode)}<br>${r.qty}x ${escapeHtml(productName(r.productCode))}${r.color?' ('+escapeHtml(r.color)+')':''}${r.note?'<br>Observação: '+escapeHtml(r.note):''}</span><span class="actions"><span class="badge ${r.status==='Pendente'?'pendente':r.status==='Aprovado'?'aprovado':'recusado'}">${r.status}</span>${r.status==='Pendente'?`<button data-approve-sale="${r.id}">Aprovar e lançar</button><button data-refuse-sale="${r.id}">Recusar</button>`:''}</span></div>`).join(''):'<div class="empty">Nenhuma venda comunicada.</div>';

    root.querySelectorAll('[data-del-entrega]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover esta entrega? Isso NÃO devolve automaticamente o estoque nem desfaz outros cálculos — use apenas para corrigir lançamentos errados (ex.: dados de teste).')) return;
      ENTREGAS = await getJSON('entregas', ENTREGAS);
      ENTREGAS = ENTREGAS.filter(e=>e.id!==b.dataset.delEntrega);
      await setJSON('entregas', ENTREGAS);
      renderAdminLists();
    }));
    root.querySelectorAll('[data-del-devolucao]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover esta devolução? Isso NÃO desfaz automaticamente o ajuste de estoque que ela possa ter gerado — use apenas para corrigir lançamentos errados (ex.: dados de teste).')) return;
      DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
      DEVOLUCOES = DEVOLUCOES.filter(d=>d.id!==b.dataset.delDevolucao);
      await setJSON('devolucoes', DEVOLUCOES);
      renderAdminLists();
    }));
    root.querySelectorAll('[data-del-acerto]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover este acerto? Isso vai tirar essa venda dos cálculos de vendido/devido/pago do cliente. Use apenas para corrigir lançamentos errados (ex.: dados de teste).')) return;
      ACERTOS = await getJSON('acertos', ACERTOS);
      ACERTOS = ACERTOS.filter(a=>a.id!==b.dataset.delAcerto);
      await setJSON('acertos', ACERTOS);
      renderAdminLists();
    }));
    root.querySelectorAll('[data-del-venda]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover esta venda direta do histórico do cliente? Use apenas para corrigir lançamentos errados (ex.: dados de teste).')) return;
      VENDAS = await getJSON('vendas', VENDAS);
      VENDAS = VENDAS.filter(v=>v.id!==b.dataset.delVenda);
      await setJSON('vendas', VENDAS);
      renderAdminLists();
    }));
    root.querySelectorAll('[data-del-pedido]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover este pedido de reposição do histórico? Se ele já estiver Aprovado, o estoque foi descontado na aprovação e remover aqui NÃO devolve isso automaticamente.')) return;
      PEDIDOS = await getJSON('pedidos', PEDIDOS);
      PEDIDOS = PEDIDOS.filter(r=>r.id!==b.dataset.delPedido);
      await setJSON('pedidos', PEDIDOS);
      renderAdminLists();
    }));
    root.querySelectorAll('[data-approve-sale]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('Aprovar esta venda e criar um acerto pendente?'))return;
      PARTNER_ACTIONS=await getJSON('partner_actions',PARTNER_ACTIONS);ACERTOS=await getJSON('acertos',ACERTOS);
      const report=PARTNER_ACTIONS.find(a=>a.id===b.dataset.approveSale);if(!report||report.status!=='Pendente')return;
      const next=Math.max(0,...ACERTOS.map(a=>Number(String(a.id||'').match(/\d+/)?.[0]||0)))+1;
      ACERTOS.push(withMovementSnapshot({id:'ACE-'+String(next).padStart(3,'0'),date:report.date,clientCode:report.clientCode,productCode:report.productCode,color:report.color||'',qty:Number(report.qty),status:'Pendente',sourcePartnerAction:report.id},'consignment'));
      report.status='Aprovado';report.reviewedAt=new Date().toISOString();
      await saveJSONBundle({acertos:ACERTOS,partner_actions:PARTNER_ACTIONS},'aprovação da venda informada');renderAdminLists();
    }));
    root.querySelectorAll('[data-refuse-sale]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('Recusar esta comunicação de venda?'))return;
      PARTNER_ACTIONS=await getJSON('partner_actions',PARTNER_ACTIONS);const report=PARTNER_ACTIONS.find(a=>a.id===b.dataset.refuseSale);if(!report||report.status!=='Pendente')return;
      report.status='Recusado';report.reviewedAt=new Date().toISOString();await setJSON('partner_actions',PARTNER_ACTIONS);renderAdminLists();
    }));

    root.querySelectorAll('[data-approve-req]').forEach(b=>b.addEventListener('click', async ()=>{
      const reqId = b.dataset.approveReq;
      // busca os pedidos frescos antes de salvar, pra não sobrescrever/apagar sem querer
      // um pedido novo que outro parceiro tenha enviado nesse meio tempo
      PEDIDOS = await getJSON('pedidos', PEDIDOS);
      const req = PEDIDOS.find(r=>r.id===reqId);
      if(!req) return;
      const items=requestItems(req);
      // Desconta o estoque de cada item de reposição. Itens classificados para produção não reduzem estoque.
      PRODUCTS=await getJSON('products',PRODUCTS);
      const shortage=items.find(item=>{
        if((item.type||req.type)!=='reposicao'||!item.color)return false;
        const product=PRODUCTS.find(p=>p.code===item.productCode),color=product&&(product.colors||[]).find(c=>c.name===item.color);
        return !color||Number(color.stock)<Number(item.qty);
      });
      if(shortage){alert(`Não foi possível aprovar: o estoque de ${productName(shortage.productCode)}${shortage.color?' ('+shortage.color+')':''} mudou e não atende mais à quantidade solicitada. Atualize o pedido ou o estoque.`);return;}
      let stockChanged=false;
      items.forEach(item=>{
        if((item.type||req.type)!=='reposicao'||!item.color)return;
        const product=PRODUCTS.find(p=>p.code===item.productCode),color=product&&(product.colors||[]).find(c=>c.name===item.color);
        if(color){color.stock=Math.max(0,(Number(color.stock)||0)-Number(item.qty));stockChanged=true;}
      });
      ENTREGAS = await getJSON('entregas', ENTREGAS);
      items.forEach(item=>{
        const entId=nextSeqId(ENTREGAS,'ENT');
        ENTREGAS.push(withMovementSnapshot({id:entId,date:todayISO(),clientCode:req.clientCode,productCode:item.productCode,color:item.color||'',qty:item.qty,batchId:req.id},'consignment'));
      });
      req.status = 'Aprovado';
      await saveJSONBundle({...((stockChanged)?{products:PRODUCTS}:{}),entregas:ENTREGAS,pedidos:PEDIDOS},'aprovação do pedido de reposição');
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-refuse-req]').forEach(b=>b.addEventListener('click', async ()=>{
      const reqId = b.dataset.refuseReq;
      PEDIDOS = await getJSON('pedidos', PEDIDOS);
      const req = PEDIDOS.find(r=>r.id===reqId);
      if(!req) return;
      // o estoque só é descontado na aprovação agora, então recusar não precisa devolver nada
      req.status = 'Recusado';
      await setJSON('pedidos', PEDIDOS);
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));

    root.querySelectorAll('[data-del-product]').forEach(b=>b.addEventListener('click', async ()=>{
      const code=b.dataset.delProduct;
      const linkedCount=[ENTREGAS,DEVOLUCOES,ACERTOS,VENDAS].reduce((sum,list)=>sum+list.filter(item=>item.productCode===code).length,0)+PEDIDOS.reduce((sum,request)=>sum+requestItems(request).filter(item=>item.productCode===code).length,0);
      const warning=linkedCount?`\n\nEste produto possui ${linkedCount} registro(s) histórico(s) vinculado(s). A exclusão pode prejudicar relatórios antigos. Prefira arquivar.`:'';
      if(!confirm(`Excluir definitivamente o produto ${code}? Esta ação não pode ser desfeita.${warning}`))return;
      PRODUCTS=await getJSON('products',PRODUCTS);
      PRODUCTS = PRODUCTS.filter(p=>p.code!==code);
      await setJSON('products', PRODUCTS);
      PRODUCT_COST_LINKS=await getJSON(PRODUCT_COST_LINKS_KEY,PRODUCT_COST_LINKS);
      PRODUCT_COST_LINKS=PRODUCT_COST_LINKS.filter(link=>link.productCode!==code);
      await setJSON(PRODUCT_COST_LINKS_KEY,PRODUCT_COST_LINKS);
      PRODUCT_DIRECT_COSTS=await getJSON(PRODUCT_DIRECT_COSTS_KEY,PRODUCT_DIRECT_COSTS);delete PRODUCT_DIRECT_COSTS[code];await setJSON(PRODUCT_DIRECT_COSTS_KEY,PRODUCT_DIRECT_COSTS);
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
    }));
    root.querySelectorAll('[data-del-client]').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Remover este cliente? O histórico de entregas/devoluções/acertos dele NÃO é apagado, mas ele deixa de aparecer na lista de clientes ativos.')) return;
      const code=b.dataset.delClient;
      CLIENTS = CLIENTS.filter(c=>c.code!==code);
      await setJSON('clients', CLIENTS);
      try{await adminRemovePartnerPin(code);}catch(error){console.error('Falha ao remover credencial do parceiro',error);}
      refreshAdminSelects(); renderAdminLists();
    }));
    root.querySelectorAll('[data-new-activation]').forEach(button=>button.addEventListener('click',async()=>{
      const code=button.dataset.newActivation,client=CLIENTS.find(item=>item.code===code);if(!client)return;
      if(!confirm(`Gerar um novo código descartável para ${client.name}? O PIN atual e as sessões abertas deixarão de funcionar.`))return;
      button.disabled=true;button.textContent='Gerando…';
      try{
        const activationCode=await adminCreatePartnerActivation(code);
        CLIENTS=await getJSON('clients',CLIENTS);const fresh=CLIENTS.find(item=>item.code===code);if(fresh){fresh.pinConfigured=false;fresh.activationPending=true;await setJSON('clients',CLIENTS);}
        showPartnerActivationCode(code,client.name,activationCode);renderAdminLists();
      }catch(error){document.getElementById('c-msg').innerHTML=`<div class="msg err">${escapeHtml(error.message||'Não foi possível gerar o novo código.')}</div>`;button.disabled=false;button.textContent='Novo código de acesso';}
    }));
    root.querySelectorAll('[data-edit-client]').forEach(b=>b.addEventListener('click', ()=>{
      const c = CLIENTS.find(c=>c.code===b.dataset.editClient);
      if(!c) return;
      editingClientCode = c.code;
      document.getElementById('c-code').value = c.code;
      document.getElementById('c-name').value = c.name || '';
      document.getElementById('c-contact').value = c.contact || '';
      document.getElementById('c-responsavel').value = c.responsavel || '';
      document.getElementById('c-document').value = c.document || '';
      document.getElementById('c-notes').value = c.notes || '';
      document.getElementById('c-pin').type = 'password';
      document.getElementById('c-pin').value = '';
      document.getElementById('c-form-title').textContent = `Editando: ${c.code} — ${c.name}`;
      document.getElementById('c-add-btn').textContent = 'Salvar alterações';
      document.getElementById('c-cancel-edit-btn').style.display = 'inline-block';
      document.getElementById('c-msg').innerHTML = '';
      // rola até o formulário, no topo da aba, pra ficar visível
      root.querySelector('.admin-tab[data-tab="clientes"] .panel').scrollIntoView({behavior:'smooth', block:'start'});
    }));
    root.querySelectorAll('[data-goto-client]').forEach(a=>a.addEventListener('click', (e)=>{
      e.preventDefault();
      const code = a.dataset.gotoClient;
      switchAdminTab('clientes',false,false);
      // rola até o cliente e dá um destaque visual temporário
      setTimeout(()=>{
        const row = document.getElementById('client-row-'+code);
        if(row){
          row.scrollIntoView({behavior:'smooth', block:'center'});
          row.classList.add('client-highlight');
          setTimeout(()=>row.classList.remove('client-highlight'), 3700);
        }
      }, 50);
    }));
  }

  document.getElementById('admin-product-search').addEventListener('input',e=>{adminProductSearch=e.target.value.trim();renderAdminLists();});
  document.getElementById('admin-product-status').addEventListener('change',e=>{adminProductStatus=e.target.value;renderAdminLists();});
  document.getElementById('admin-product-sort').addEventListener('change',e=>{adminProductSort=e.target.value;renderAdminLists();});

  // ---------- seletor de categorias ----------
  function renderCategoryPicker(){
    const selectedWrap = document.getElementById('p-cat-selected');
    selectedWrap.innerHTML = pendingCategories.length
      ? pendingCategories.map((c,i)=>`<span class="color-chip">${escapeHtml(c)}<button data-remove-pending-cat="${i}">✕</button></span>`).join('')
      : `<span style="color:var(--muted);font-size:11px;">Nenhuma categoria selecionada ainda.</span>`;
    selectedWrap.querySelectorAll('[data-remove-pending-cat]').forEach(btn=>btn.addEventListener('click', ()=>{
      pendingCategories.splice(Number(btn.dataset.removePendingCat), 1);
      renderCategoryPicker();
      markProductDirty();
    }));

    document.getElementById('known-categories-list').innerHTML = KNOWN_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}"></option>`).join('');

    const knownList = document.getElementById('p-cat-known-list');
    const notSelected = KNOWN_CATEGORIES.filter(c=>!pendingCategories.includes(c));
    knownList.innerHTML = notSelected.length
      ? `<div style="font-size:10px;color:var(--muted);margin-bottom:6px;font-family:'IBM Plex Mono';text-transform:uppercase;">Categorias já usadas — clique pra adicionar</div>
         <div class="color-chips">${notSelected.map(c=>`<span class="color-chip" style="cursor:pointer;" data-pick-known-cat="${escapeHtml(c)}">+ ${escapeHtml(c)}</span>`).join('')}</div>`
      : '';
    knownList.querySelectorAll('[data-pick-known-cat]').forEach(el=>el.addEventListener('click', ()=>{
      pendingCategories.push(el.dataset.pickKnownCat);
      renderCategoryPicker();
      markProductDirty();
    }));
  }
  async function addPendingCategory(){
    const input = document.getElementById('p-cat-input');
    const val = input.value.trim();
    if(!val) return;
    if(!pendingCategories.includes(val)) pendingCategories.push(val);
    if(!KNOWN_CATEGORIES.includes(val)){
      KNOWN_CATEGORIES.push(val);
      await setJSON('categories', KNOWN_CATEGORIES);
    }
    input.value = '';
    renderCategoryPicker();
    markProductDirty();
  }
  document.getElementById('p-cat-add-btn').addEventListener('click', addPendingCategory);
  document.getElementById('p-cat-input').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); addPendingCategory(); }
  });

  function resetProductForm(clearDraft=true){
    editingProductCode = null;
    pendingCategories = [];
    pendingGallery = [];
    pendingColors = [];
    ['p-code','p-name','p-public-price','p-price','p-promo-price','p-img','p-video','p-desc','p-first-color-name','p-first-color-stock','p-first-color-price','p-first-color-promo','p-first-color-img'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('p-prefix').value = '';
    document.getElementById('p-ondemand').checked = false;
    document.getElementById('p-customizable').checked = false;
    document.getElementById('p-no-consignment').checked = false;
    document.getElementById('p-video-sound').checked = false;
    updateConsignmentFieldState();
    document.getElementById('p-active').checked = true;
    document.getElementById('p-customizable-minqty').value = '';
    document.getElementById('p-customizable-minqty-wrap').style.display = 'none';
    document.getElementById('p-code').disabled = false;
    document.getElementById('p-form-title').textContent = 'Novo produto';
    document.getElementById('p-form-status').textContent = 'Novo cadastro';
    document.getElementById('p-add-btn').textContent = 'Adicionar produto';
    document.getElementById('p-cancel-edit-btn').style.display = 'none';
    document.getElementById('p-first-color-wrap').style.display = 'block';
    document.getElementById('p-edit-colors-wrap').style.display = 'none';
    document.getElementById('p-edit-colors-list').innerHTML = '';
    document.getElementById('p-form-add-color-btn').style.display = 'inline-flex';
    document.getElementById('p-color-form-title').textContent = 'Adicionar cor ou variação';
    document.getElementById('p-color-form-help').textContent = 'Você pode adicionar todas as variações antes de salvar o produto.';
    document.getElementById('p-image-preview-box').style.backgroundImage = '';
    document.getElementById('p-image-preview-box').textContent = 'Prévia da imagem principal';
    ['p-main-image-upload-status','p-gallery-upload-status','p-first-color-upload-status','p-video-upload-status'].forEach(id=>document.getElementById(id).textContent='');
    ['p-main-image-file','p-gallery-files','p-first-color-file','p-video-file'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('p-video-upload-progress').classList.remove('active');document.getElementById('p-video-upload-progress').value=0;
    document.getElementById('p-video-upload-summary').classList.remove('visible');document.getElementById('p-video-upload-summary').innerHTML='';
    renderPendingGallery();
    document.getElementById('p-cost-calculation').value = '';
    renderSelectedCostCalculation();
    renderCategoryPicker();
    updateProductPricePreview();
    updateDescriptionCounter();
    showProductStep(0);
    if(clearDraft)clearProductDraft();
  }
  document.getElementById('p-cancel-edit-btn').addEventListener('click', ()=>{
    resetProductForm();
    document.getElementById('p-msg').innerHTML = '';
  });

  function nextCodeForPrefix(prefix){
    let maxNum = 0;
    PRODUCTS.forEach(p=>{
      if(p.code && p.code.startsWith(prefix)){
        const numPart = p.code.slice(prefix.length);
        const n = parseInt(numPart, 10);
        if(!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    return prefix + String(maxNum + 1).padStart(4, '0');
  }
  document.getElementById('p-prefix').addEventListener('change', ()=>{
    const prefix = document.getElementById('p-prefix').value;
    if(!prefix) return;
    // só preenche automaticamente ao cadastrar um produto novo, sem sobrescrever ao editar
    if(!editingProductCode){
      document.getElementById('p-code').value = nextCodeForPrefix(prefix);
    }
  });

  document.getElementById('p-customizable').addEventListener('change', (e)=>{
    document.getElementById('p-customizable-minqty-wrap').style.display = e.target.checked ? 'flex' : 'none';
  });

  const CUSTOMIZABLE_CATEGORY = 'Personalizável';
  const CUSTOMIZABLE_NOTE_REGEX = /✨ Este produto também pode ser feito personalizado \(cor, nome, tema, etc\.\)(?: — pedido mínimo de \d+ unidades? para personalização)? — combine os detalhes pelo WhatsApp\./g;
  function buildCustomizableNote(minQty){
    const minPart = minQty ? ` — pedido mínimo de ${minQty} unidade${minQty === 1 ? '' : 's'} para personalização` : '';
    return `✨ Este produto também pode ser feito personalizado (cor, nome, tema, etc.)${minPart} — combine os detalhes pelo WhatsApp.`;
  }
  function applyCustomizableSync(description, categories, isCustomizable, minQty){
    // remove qualquer ocorrência anterior do aviso automático (com ou sem mínimo), pra não duplicar ao marcar/desmarcar ou trocar o mínimo várias vezes
    let desc = description.replace(CUSTOMIZABLE_NOTE_REGEX, '').trim();
    desc = desc.replace(/\n{3,}/g, '\n\n').trim();
    let cats = categories.filter(c=>c !== CUSTOMIZABLE_CATEGORY);
    if(isCustomizable){
      const note = buildCustomizableNote(minQty);
      desc = desc ? `${desc}\n\n${note}` : note;
      cats = [...cats, CUSTOMIZABLE_CATEGORY];
    }
    return { description: desc, categories: cats };
  }

  document.getElementById('p-add-btn').addEventListener('click', async ()=>{
    const code = document.getElementById('p-code').value.trim().toUpperCase();
    const name = normalizeProductName(document.getElementById('p-name').value);
    document.getElementById('p-name').value=name;
    const publicPrice = parseFloat(document.getElementById('p-public-price').value);
    const price = parseFloat(document.getElementById('p-price').value);
    const promoPriceRaw = document.getElementById('p-promo-price').value;
    const promoPrice = promoPriceRaw.trim() === '' ? null : parseFloat(promoPriceRaw);
    const image = document.getElementById('p-img').value.trim();
    const video = document.getElementById('p-video').value.trim();
    const videoMuted = !document.getElementById('p-video-sound').checked;
    const descriptionRaw = document.getElementById('p-desc').value.trim();
    const onDemand = document.getElementById('p-ondemand').checked;
    const customizable = document.getElementById('p-customizable').checked;
    const consignmentAvailable = !document.getElementById('p-no-consignment').checked;
    const active = document.getElementById('p-active').checked;
    const minQtyRaw = document.getElementById('p-customizable-minqty').value;
    const customizableMinQty = minQtyRaw.trim() === '' ? null : Math.max(1, parseInt(minQtyRaw) || 1);
    const msg = document.getElementById('p-msg');
    if(!/^[A-Z0-9-]{2,20}$/.test(code)){ msg.innerHTML = '<div class="msg err">Informe um código com 2 a 20 caracteres, usando apenas letras, números ou hífen.</div>'; showProductStep(0); return; }
    if(!name){ msg.innerHTML = '<div class="msg err">Informe o nome do produto.</div>'; showProductStep(0); return; }
    if(isNaN(publicPrice)||publicPrice<=0||(consignmentAvailable&&(isNaN(price)||price<0))){ msg.innerHTML = `<div class="msg err">Informe ${consignmentAvailable?'os preços público e de repasse':'um preço público'} válido.</div>`; showProductStep(1); return; }
    if(consignmentAvailable&&price>publicPrice){ msg.innerHTML='<div class="msg err">O repasse não pode ser maior que o preço ao público.</div>'; showProductStep(1); return; }
    if(promoPrice!==null&&(!Number.isFinite(promoPrice)||promoPrice<=0||promoPrice>=publicPrice)){ msg.innerHTML='<div class="msg err">O preço promocional deve ser maior que zero e menor que o preço ao público.</div>'; showProductStep(1); return; }
    if(image&&!/^https:\/\//i.test(image)){ msg.innerHTML='<div class="msg err">A imagem principal precisa começar com https://.</div>'; showProductStep(2); return; }
    if(video&&!/^https:\/\//i.test(video)){ msg.innerHTML='<div class="msg err">O vídeo precisa começar com https://.</div>'; showProductStep(2); return; }

    PRODUCTS = await getJSON('products', PRODUCTS);

    if(editingProductCode){
      const previousCode=editingProductCode;
      const p = PRODUCTS.find(p=>p.code===editingProductCode);
      if(!p){ msg.innerHTML = '<div class="msg err">Produto não encontrado (pode ter sido removido).</div>'; return; }

      const codeChanged = code !== editingProductCode;
      if(codeChanged && PRODUCTS.some(other=>other.code===code)){
        msg.innerHTML = '<div class="msg err">Já existe outro produto com esse código.</div>';
        return;
      }

      if(codeChanged){
        // atualiza em cascata todos os registros que referenciam o código antigo, pra não quebrar nada
        const oldCode = editingProductCode;
        ENTREGAS = await getJSON('entregas', ENTREGAS);
        DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
        ACERTOS = await getJSON('acertos', ACERTOS);
        PEDIDOS = await getJSON('pedidos', PEDIDOS);
        VENDAS = await getJSON('vendas', VENDAS);
        PRODUCT_DIRECT_COSTS = await getJSON(PRODUCT_DIRECT_COSTS_KEY, PRODUCT_DIRECT_COSTS);
        ENTREGAS.forEach(e=>{ if(e.productCode===oldCode) e.productCode = code; });
        DEVOLUCOES.forEach(d=>{ if(d.productCode===oldCode) d.productCode = code; });
        ACERTOS.forEach(a=>{ if(a.productCode===oldCode) a.productCode = code; });
        PEDIDOS.forEach(r=>{ if(Array.isArray(r.items))r.items.forEach(item=>{if(item.productCode===oldCode)item.productCode=code;});else if(r.productCode===oldCode)r.productCode=code; });
        VENDAS.forEach(v=>{if(v.productCode===oldCode)v.productCode=code;});
        if(Object.prototype.hasOwnProperty.call(PRODUCT_DIRECT_COSTS,oldCode)){PRODUCT_DIRECT_COSTS[code]=PRODUCT_DIRECT_COSTS[oldCode];delete PRODUCT_DIRECT_COSTS[oldCode];}
        await setJSON('entregas', ENTREGAS);
        await setJSON('devolucoes', DEVOLUCOES);
        await setJSON('acertos', ACERTOS);
        await setJSON('pedidos', PEDIDOS);
        await setJSON('vendas', VENDAS);
        await setJSON(PRODUCT_DIRECT_COSTS_KEY, PRODUCT_DIRECT_COSTS);
        p.code = code;
      }

      const synced = applyCustomizableSync(descriptionRaw, [...pendingCategories], customizable, customizableMinQty);
      p.name = name;
      p.categories = synced.categories;
      delete p.category;
      p.publicPrice = publicPrice;
      p.price = Number.isFinite(price)?price:0;
      p.consignmentAvailable = consignmentAvailable;
      p.promoPrice = promoPrice;
      p.image = image;
      p.video = video;
      p.videoMuted = videoMuted;
      p.description = synced.description;
      p.gallery = [...pendingGallery];
      p.onDemand = onDemand;
      p.customizable = customizable;
      p.customizableMinQty = customizable ? customizableMinQty : null;
      p.active = active;
      p.updatedAt = Date.now();
      await setJSON('products', PRODUCTS);
      await saveProductCostLink(code,previousCode);
      msg.innerHTML = codeChanged
        ? '<div class="msg ok">Alterações salvas — código atualizado nos registros vinculados.</div>'
        : '<div class="msg ok">Alterações salvas.</div>';
      resetProductForm();
      refreshAdminSelects(); renderAdminLists(); renderPortfolio();
      return;
    }

    if(PRODUCTS.some(p=>p.code===code)){ msg.innerHTML = '<div class="msg err">Já existe um produto com esse código.</div>'; return; }
    const colors = pendingColors.map(color=>({...color}));
    const firstColorName = document.getElementById('p-first-color-name').value.trim();
    if(firstColorName){
      const firstColorImage=document.getElementById('p-first-color-img').value.trim();
      const firstColorPriceRaw=document.getElementById('p-first-color-price').value.trim(),firstColorPromoRaw=document.getElementById('p-first-color-promo').value.trim();
      const firstColorPrice=firstColorPriceRaw===''?null:parseFloat(firstColorPriceRaw),firstColorPromo=firstColorPromoRaw===''?null:parseFloat(firstColorPromoRaw);
      if(firstColorImage&&!/^https:\/\//i.test(firstColorImage)){msg.innerHTML='<div class="msg err">A foto da primeira cor precisa começar com https://.</div>';showProductStep(2);return;}
      if(colors.some(color=>color.name.toLowerCase()===firstColorName.toLowerCase())){msg.innerHTML='<div class="msg err">Já existe uma variação com esse nome.</div>';showProductStep(2);return;}
      if(firstColorPrice!==null&&(!Number.isFinite(firstColorPrice)||firstColorPrice<=0)){msg.innerHTML='<div class="msg err">O preço próprio da variação deve ser maior que zero.</div>';showProductStep(2);return;}
      const firstPromoBase=firstColorPrice??publicPrice;
      if(firstColorPromo!==null&&(!Number.isFinite(firstColorPromo)||firstColorPromo<=0||firstColorPromo>=firstPromoBase)){msg.innerHTML='<div class="msg err">A promoção da variação deve ser menor que seu preço normal.</div>';showProductStep(2);return;}
      colors.push({
        name: firstColorName,
        stock: Math.max(0, parseInt(document.getElementById('p-first-color-stock').value) || 0),
        image: firstColorImage,
        publicPrice:firstColorPrice,
        promoPrice:firstColorPromo,
      });
    }
    PRODUCTS.push((()=>{
      const synced = applyCustomizableSync(descriptionRaw, [...pendingCategories], customizable, customizableMinQty);
      return {code, name, categories: synced.categories, price:Number.isFinite(price)?price:0, publicPrice, promoPrice, image, video, videoMuted, description: synced.description, onDemand, customizable, customizableMinQty: customizable ? customizableMinQty : null, consignmentAvailable, colors, gallery:[...pendingGallery], active, createdAt: Date.now(), updatedAt:Date.now()};
    })());
    await setJSON('products', PRODUCTS);
    await saveProductCostLink(code);
    msg.innerHTML = '<div class="msg ok">Produto adicionado.</div>';
    resetProductForm();
    refreshAdminSelects(); renderAdminLists(); renderPortfolio();
  });

  // ---------- AJUSTE DE PREÇOS EM MASSA ----------
  let bulkPreviewState=null;
  function getBulkTargetProducts(){
    const category = document.getElementById('bulk-category').value;
    return PRODUCTS.filter(p => !category || getCategories(p).includes(category));
  }

  document.getElementById('bulk-preview-btn').addEventListener('click', ()=>{
    const operation=document.getElementById('bulk-operation').value;
    const pctRaw = document.getElementById('bulk-pct').value;
    const pct = parseFloat(pctRaw);
    const target = document.getElementById('bulk-target').value;
    const msg = document.getElementById('bulk-msg');
    const preview = document.getElementById('bulk-preview');
    const applyBtn = document.getElementById('bulk-apply-btn');
    msg.innerHTML = ''; preview.innerHTML = ''; applyBtn.style.display = 'none';

    bulkPreviewState=null;
    if(operation==='price'&&(isNaN(pct) || pct === 0)){ msg.innerHTML = '<div class="msg err">Informe um percentual diferente de zero (ex.: 10 ou -10).</div>'; return; }
    if(operation==='price'&&1+(pct/100)<=0){msg.innerHTML='<div class="msg err">O reajuste não pode reduzir os preços a zero ou a valores negativos.</div>';return;}

    const affected = getBulkTargetProducts().filter(p=>{
      if(operation==='ondemand-on')return !p.onDemand;
      if(operation==='ondemand-off')return !!p.onDemand;
      if(target === 'public' || target === 'both'){ if(p.publicPrice != null) return true; }
      if(target === 'price' || target === 'both'){ if(p.price != null) return true; }
      return false;
    });
    if(affected.length === 0){ msg.innerHTML = '<div class="msg err">Nenhum produto encontrado com essa combinação de filtros.</div>'; return; }

    const factor = 1 + (pct / 100);
    const invalidMargins=affected.filter(p=>{
      if(operation!=='price')return false;
      const nextPublic=(target==='public'||target==='both')&&p.publicPrice!=null?Number(p.publicPrice)*factor:Number(p.publicPrice);
      const nextConsig=(target==='price'||target==='both')&&p.price!=null?Number(p.price)*factor:Number(p.price);
      return Number.isFinite(nextPublic)&&Number.isFinite(nextConsig)&&nextConsig>nextPublic;
    });
    if(invalidMargins.length){msg.innerHTML=`<div class="msg err">O reajuste deixaria o repasse acima do preço público em ${invalidMargins.length} produto(s). Ajuste o percentual ou aplique a alteração nos dois preços.</div>`;return;}
    const rows = affected.slice(0, 6).map(p=>{
      if(operation!=='price')return `<div class="list-row"><span class="mono">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</span><span style="font-size:11px;color:var(--muted);">${operation==='ondemand-on'?'Estoque controlado → Sob encomenda':'Sob encomenda → Estoque controlado'}</span></div>`;
      const lines = [];
      if((target === 'public' || target === 'both') && p.publicPrice != null){
        lines.push(`Público: ${fmtMoney(p.publicPrice)} → <strong style="color:var(--teal);">${fmtMoney(p.publicPrice * factor)}</strong>`);
      }
      if((target === 'price' || target === 'both') && p.price != null){
        lines.push(`Consignado: ${fmtMoney(p.price)} → <strong style="color:var(--teal);">${fmtMoney(p.price * factor)}</strong>`);
      }
      return `<div class="list-row"><span class="mono">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</span><span style="font-size:11px;color:var(--muted);">${lines.join(' · ')}</span></div>`;
    }).join('');
    const moreLabel = affected.length > 6 ? `<div style="color:var(--muted);font-size:11px;margin-top:6px;">+ ${affected.length - 6} produto(s) a mais...</div>` : '';

    preview.innerHTML = `
      <div style="margin:10px 0;">
        <div style="font-size:12px;color:var(--ink);margin-bottom:8px;">${operation==='price'?`${affected.length} produto(s) serão ${pct > 0 ? 'reajustados para cima' : 'reajustados para baixo'} em ${Math.abs(pct)}%:`:`${affected.length} produto(s) serão alterados para “${operation==='ondemand-on'?'Sob encomenda':'Com controle de estoque'}”:`}</div>
        ${rows}${moreLabel}
      </div>`;
    applyBtn.style.display = 'inline-block';
    bulkPreviewState={operation,pct,target,codes:affected.map(p=>p.code)};
  });

  document.getElementById('bulk-apply-btn').addEventListener('click', async ()=>{
    if(!bulkPreviewState)return;
    const {operation,pct,target,codes}=bulkPreviewState;
    const msg = document.getElementById('bulk-msg');
    const btn = document.getElementById('bulk-apply-btn');
    btn.disabled = true; btn.textContent = 'Aplicando…';

    PRODUCTS = await getJSON('products', PRODUCTS);
    const factor = 1 + (pct / 100);
    let count = 0;
    codes.forEach(code=>{
      const fresh = PRODUCTS.find(fp=>fp.code===code);
      if(!fresh) return;
      let touched = false;
      if(operation==='ondemand-on'&&!fresh.onDemand){fresh.onDemand=true;touched=true;}
      else if(operation==='ondemand-off'&&fresh.onDemand){fresh.onDemand=false;touched=true;}
      else if(operation==='price'&&(target === 'public' || target === 'both') && fresh.publicPrice != null){
        fresh.publicPrice = Math.round(fresh.publicPrice * factor * 100) / 100;
        if(fresh.promoPrice!=null&&Number(fresh.promoPrice)>=fresh.publicPrice)fresh.promoPrice=null;
        (fresh.colors||[]).forEach(color=>{if(color.promoPrice!=null&&Number(color.promoPrice)>=fresh.publicPrice)color.promoPrice=null;});
        touched = true;
      }
      if(operation==='price'&&(target === 'price' || target === 'both') && fresh.price != null){
        fresh.price = Math.round(fresh.price * factor * 100) / 100;
        touched = true;
      }
      if(touched) count++;
      if(touched)fresh.updatedAt=Date.now();
    });
    await setJSON('products', PRODUCTS);

    msg.innerHTML = `<div class="msg ok">${operation==='price'?'Reajuste':'Alteração'} aplicado em ${count} produto(s).</div>`;
    document.getElementById('bulk-preview').innerHTML = '';
    btn.style.display = 'none';
    btn.disabled = false; btn.textContent = 'Confirmar e aplicar';
    document.getElementById('bulk-pct').value = '';
    bulkPreviewState=null;
    refreshAdminSelects(); renderAdminLists(); renderPortfolio();
  });

  function invalidateBulkPreview(){
    bulkPreviewState=null;document.getElementById('bulk-preview').innerHTML='';document.getElementById('bulk-msg').innerHTML='';document.getElementById('bulk-apply-btn').style.display='none';
  }
  ['bulk-pct','bulk-target','bulk-category'].forEach(id=>document.getElementById(id).addEventListener('input',invalidateBulkPreview));
  document.getElementById('bulk-operation').addEventListener('change',e=>{
    const priceMode=e.target.value==='price';document.querySelectorAll('.bulk-price-field').forEach(field=>field.style.display=priceMode?'flex':'none');invalidateBulkPreview();
  });

  function nextPartnerCode(clients=CLIENTS){
    const highest=(Array.isArray(clients)?clients:[]).reduce((max,client)=>{
      const match=/^HL(\d{4})$/i.exec(String(client?.code||'').trim());
      return match?Math.max(max,Number(match[1])):max;
    },0);
    if(highest>=9999)throw new Error('A sequência de códigos HL chegou ao limite de 9999.');
    return `HL${String(highest+1).padStart(4,'0')}`;
  }
  function updateNewClientCode(){
    if(editingClientCode)return;
    const input=document.getElementById('c-code');
    if(!input)return;
    try{input.value=nextPartnerCode();}
    catch(error){input.value='';document.getElementById('c-msg').innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;}
  }
  function resetClientForm(){
    editingClientCode = null;
    ['c-code','c-name','c-contact','c-responsavel','c-document','c-notes','c-pin'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('c-pin').type='password';
    document.getElementById('c-code').disabled = false;
    document.getElementById('c-code').readOnly = true;
    document.getElementById('c-form-title').textContent = 'Novo cliente';
    document.getElementById('c-add-btn').textContent = 'Adicionar cliente';
    document.getElementById('c-cancel-edit-btn').style.display = 'none';
    updateNewClientCode();
  }
  document.getElementById('c-cancel-edit-btn').addEventListener('click', ()=>{
    resetClientForm();
    document.getElementById('c-msg').innerHTML = '';
  });

  document.getElementById('c-generate-pin-btn').addEventListener('click',()=>{
    const random=new Uint32Array(1);crypto.getRandomValues(random);
    const pin=String(100000+(random[0]%900000));
    const input=document.getElementById('c-pin');
    input.type='text';input.value=pin;input.focus();input.select();
    document.getElementById('c-msg').innerHTML=`<div class="msg ok">PIN gerado: <strong class="mono">${pin}</strong>. Anote-o para enviar ao parceiro; depois de salvar, ele não será exibido novamente.</div>`;
  });

  async function adminSetPartnerPin(code,pin){
    const {error}=await supabaseClient.rpc('admin_set_partner_pin',{p_client_code:code,p_pin:pin});
    if(error){
      if(isMissingSecurityFunction(error))throw new Error('Execute primeiro o novo arquivo de segurança no Supabase para habilitar os PINs.');
      throw error;
    }
  }
  async function adminCreatePartnerActivation(code){
    const {data,error}=await supabaseClient.rpc('admin_create_partner_activation',{p_client_code:code});
    if(error){if(isMissingSecurityFunction(error))throw new Error('Execute a atualização de primeiro acesso no Supabase.');throw error;}
    return String(data||'').trim().toUpperCase();
  }
  function showPartnerActivationCode(code,name,activationCode){
    const msg=document.getElementById('c-msg');
    const invite=`Olá, ${name}! Seu acesso à Área do Parceiro da Heitor Labs foi criado. Código do parceiro: ${code}. Código de ativação: ${activationCode}. No primeiro acesso, escolha a opção “Primeiro acesso” e crie seu PIN pessoal. O código de ativação é descartável e válido por 30 dias.`;
    msg.innerHTML=`<div class="msg ok"><strong>Cliente salvo.</strong><br>Código do parceiro: <strong class="mono" style="font-size:16px;">${escapeHtml(code)}</strong><br>Código de ativação: <strong class="mono" style="font-size:16px;">${escapeHtml(activationCode)}</strong><br><span style="font-size:11px;">O código de ativação é válido por 30 dias e utilizado uma única vez.</span><div style="margin-top:9px;display:flex;gap:7px;flex-wrap:wrap;"><button type="button" class="btn secondary" id="c-copy-activation-btn">Copiar mensagem de acesso</button></div></div>`;
    document.getElementById('c-copy-activation-btn').addEventListener('click',async event=>{try{await navigator.clipboard.writeText(invite);event.currentTarget.textContent='Mensagem copiada';}catch(e){window.prompt('Copie a mensagem abaixo:',invite);}});
  }
  async function adminRemovePartnerPin(code){
    const {error}=await supabaseClient.rpc('admin_remove_partner_pin',{p_client_code:code});
    if(error&&!isMissingSecurityFunction(error))throw error;
  }

  document.getElementById('c-add-btn').addEventListener('click', async ()=>{
    let code = document.getElementById('c-code').value.trim().toUpperCase();
    const name = document.getElementById('c-name').value.trim();
    const contact = document.getElementById('c-contact').value.trim();
    const responsavel = document.getElementById('c-responsavel').value.trim();
    const document_ = document.getElementById('c-document').value.trim();
    const notes = document.getElementById('c-notes').value.trim();
    const pin = document.getElementById('c-pin').value.trim();
    const msg = document.getElementById('c-msg');
    if(!name){ msg.innerHTML = '<div class="msg err">Preencha o nome ou a razão social.</div>'; return; }
    if(pin&&!/^\d{4,8}$/.test(pin)){msg.innerHTML='<div class="msg err">O PIN deve conter somente 4 a 8 números.</div>';return;}

    if(editingClientCode){
      CLIENTS = await getJSON('clients', CLIENTS);
      const c = CLIENTS.find(c=>c.code===editingClientCode);
      if(!c){ msg.innerHTML = '<div class="msg err">Cliente não encontrado (pode ter sido removido).</div>'; return; }

      const codeChanged = code !== editingClientCode;
      if(codeChanged && CLIENTS.some(other=>other.code===code)){
        msg.innerHTML = '<div class="msg err">Já existe outro cliente com esse código.</div>';
        return;
      }
      let activationCode='';
      try{if(codeChanged)activationCode=await adminCreatePartnerActivation(code);else if(pin)await adminSetPartnerPin(code,pin);}catch(error){msg.innerHTML=`<div class="msg err">${escapeHtml(error.message||'Não foi possível configurar o acesso.')}</div>`;return;}
      if(codeChanged){
        // atualiza em cascata todos os registros que referenciam o código antigo, pra não perder o histórico
        const oldCode = editingClientCode;
        ENTREGAS = await getJSON('entregas', ENTREGAS);
        DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
        ACERTOS = await getJSON('acertos', ACERTOS);
        PEDIDOS = await getJSON('pedidos', PEDIDOS);
        VENDAS = await getJSON('vendas', VENDAS);
        DOCUMENTS = await getJSON('documents', DOCUMENTS);
        ENTREGAS.forEach(e=>{ if(e.clientCode===oldCode) e.clientCode = code; });
        DEVOLUCOES.forEach(d=>{ if(d.clientCode===oldCode) d.clientCode = code; });
        ACERTOS.forEach(a=>{ if(a.clientCode===oldCode) a.clientCode = code; });
        PEDIDOS.forEach(r=>{ if(r.clientCode===oldCode) r.clientCode = code; });
        VENDAS.forEach(v=>{ if(v.clientCode===oldCode) v.clientCode = code; });
        DOCUMENTS.forEach(d=>{ if(d.clientCode===oldCode) d.clientCode = code; });
        await setJSON('entregas', ENTREGAS);
        await setJSON('devolucoes', DEVOLUCOES);
        await setJSON('acertos', ACERTOS);
        await setJSON('pedidos', PEDIDOS);
        await setJSON('vendas', VENDAS);
        await setJSON('documents', DOCUMENTS);
        c.code = code;
      }

      c.name = name;
      c.contact = contact;
      c.responsavel = responsavel;
      c.document = document_;
      c.notes = notes;
      if(pin)c.pinConfigured=true;
      if(codeChanged){c.pinConfigured=false;c.activationPending=true;}
      await setJSON('clients', CLIENTS);
      if(codeChanged)await adminRemovePartnerPin(editingClientCode);
      msg.innerHTML = '<div class="msg ok">Alterações salvas.</div>';
      resetClientForm();
      if(codeChanged)showPartnerActivationCode(code,name,activationCode);
      refreshAdminSelects(); renderAdminLists();
      return;
    }

    CLIENTS = await getJSON('clients', CLIENTS);
    try{code=nextPartnerCode(CLIENTS);document.getElementById('c-code').value=code;}
    catch(error){msg.innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;return;}
    if(CLIENTS.some(c=>c.code===code)){ msg.innerHTML = '<div class="msg err">Não foi possível reservar o próximo código. Atualize a página e tente novamente.</div>'; return; }
    let activationCode='';
    try{activationCode=await adminCreatePartnerActivation(code);}catch(error){msg.innerHTML=`<div class="msg err">${escapeHtml(error.message||'Não foi possível gerar o código de ativação.')}</div>`;return;}
    CLIENTS.push({code, name, contact, responsavel, document: document_, notes, status:'Ativo',pinConfigured:false,activationPending:true});
    await setJSON('clients', CLIENTS);
    resetClientForm();
    showPartnerActivationCode(code,name,activationCode);
    refreshAdminSelects(); renderAdminLists();
  });

  let entregaLines = [];
  let lastEntregaTerm = null;

  function gerarPdfTermoEntrega(term){
    if(!window.jspdf?.jsPDF) throw new Error('O gerador de PDF ainda não carregou. Verifique a conexão e tente novamente.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({unit:'mm', format:'a4'});
    if(typeof doc.autoTable !== 'function') throw new Error('Não foi possível carregar a tabela do PDF. Atualize a página e tente novamente.');

    const margin = 18;
    const pageWidth = doc.internal.pageSize.getWidth();
    const client = term.client || {};
    const logo = document.getElementById('brand-logo-img');
    if(logo?.src?.startsWith('data:image')){
      try{ doc.addImage(logo.src, logo.src.includes('image/png') ? 'PNG' : 'JPEG', margin, 12, 22, 22); }catch(e){}
    }
    doc.setTextColor(33,30,26);
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.text('Anexo I — Termo de Entrega / Remessa', 45, 18);
    doc.setFontSize(11);
    doc.text('de Mercadorias', 45, 24);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110,103,93);
    doc.text('HL 3D Solutions / Heitor Labs', 45, 30);
    doc.setDrawColor(105,71,199);
    doc.setLineWidth(0.7);
    doc.line(margin, 38, pageWidth-margin, 38);

    doc.setTextColor(33,30,26);
    doc.setFontSize(9.5);
    doc.setFont('helvetica','bold');
    doc.text(`Nº do Termo: ${term.number}`, margin, 48);
    doc.text(`Data: ${fmtDate(term.date)}`, 140, 48);
    doc.setFont('helvetica','normal');
    doc.text(`Consignatário: ${client.name || term.clientCode}`, margin, 56);
    let infoY = 62;
    if(client.responsavel){ doc.text(`Responsável: ${client.responsavel}`, margin, infoY); infoY += 6; }
    if(client.document){ doc.text(`CPF/CNPJ: ${client.document}`, margin, infoY); infoY += 6; }
    if(client.contact){ doc.text(`Contato: ${client.contact}`, margin, infoY); infoY += 6; }

    const rows = term.items.map((item, index)=>[
      String(index+1),
      `${item.productNameSnapshot||productName(item.productCode)}${movementColorName(item) ? ` — ${movementColorName(item)}` : ''}`,
      String(item.qty),
      fmtMoney(item.unitPrice),
      fmtMoney(item.total)
    ]);
    doc.autoTable({
      startY: infoY + 2,
      head:[['Item','Produto','Quantidade','Valor unit.','Valor total']],
      body:rows,
      foot:[['','','','Total da remessa',fmtMoney(term.totalValue)]],
      margin:{left:margin,right:margin},
      theme:'grid',
      styles:{font:'helvetica',fontSize:8.5,cellPadding:3,textColor:[33,30,26],lineColor:[226,220,207],lineWidth:0.2},
      headStyles:{fillColor:[105,71,199],textColor:[255,255,255],fontStyle:'bold'},
      footStyles:{fillColor:[241,236,227],textColor:[33,30,26],fontStyle:'bold'},
      columnStyles:{0:{halign:'center',cellWidth:13},2:{halign:'center',cellWidth:25},3:{halign:'right',cellWidth:28},4:{halign:'right',cellWidth:30}}
    });

    let y = (doc.lastAutoTable?.finalY || infoY+30) + 12;
    const declaration = 'Declaro, para os devidos fins, que os produtos acima discriminados foram entregues ao consignatário em regime de consignação, conforme as condições acordadas entre as partes.';
    const declarationLines = doc.splitTextToSize(declaration, pageWidth-(margin*2));
    if(y + declarationLines.length*5 + 42 > 282){ doc.addPage(); y = 24; }
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(70,66,60);
    doc.text(declarationLines, margin, y);
    y += declarationLines.length*5 + 27;
    doc.setDrawColor(80,76,70);
    doc.setLineWidth(0.3);
    doc.line(margin, y, 92, y);
    doc.line(118, y, pageWidth-margin, y);
    doc.setFontSize(8);
    doc.setTextColor(70,66,60);
    doc.text('Assinatura do Consignante', 55, y+5, {align:'center'});
    doc.text('HL 3D Solutions / Heitor Labs', 55, y+10, {align:'center'});
    doc.text('Assinatura do Consignatário', 155, y+5, {align:'center'});
    doc.text(client.name || term.clientCode, 155, y+10, {align:'center'});

    const safeClient = String(client.name || term.clientCode || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'');
    doc.save(`Termo_Entrega_${term.number}_${safeClient}.pdf`);
  }

  function renderEntregaLines(){
    const wrap = document.getElementById('e-lines-wrap');
    const list = document.getElementById('e-lines-list');
    const summary = document.getElementById('e-lines-summary');
    if(entregaLines.length === 0){ wrap.style.display = 'none'; list.innerHTML = ''; summary.innerHTML = ''; return; }
    wrap.style.display = 'block';
    list.innerHTML = entregaLines.map((line, i)=>`
      <div class="list-row"><span class="mono">${line.qty}x ${escapeHtml(productName(line.productCode))}${line.color ? ' ('+escapeHtml(line.color)+')' : ''} — ${fmtMoney(productPrice(line.productCode) * line.qty)}</span>
      <span class="actions"><button data-remove-entrega-line="${i}">Remover</button></span></div>
    `).join('');
    list.querySelectorAll('[data-remove-entrega-line]').forEach(b=>b.addEventListener('click', ()=>{
      entregaLines.splice(+b.dataset.removeEntregaLine, 1);
      renderEntregaLines();
    }));
    // resumo: total de peças e valor total ao preço consignado (o que o parceiro deve ao repassar tudo)
    const totalQty = entregaLines.reduce((s,l)=>s+Number(l.qty), 0);
    const totalValue = entregaLines.reduce((s,l)=>s+productPrice(l.productCode)*Number(l.qty), 0);
    const totalSkus = entregaLines.length;
    summary.innerHTML = `
      <div class="cart-total-box">
        <div class="cart-total-row"><span>Itens diferentes</span><span>${totalSkus}</span></div>
        <div class="cart-total-row"><span>Total de peças</span><span>${totalQty}</span></div>
        <div class="cart-total-row grand"><span>Valor total (consignado)</span><span>${fmtMoney(totalValue)}</span></div>
      </div>`;
  }
  document.getElementById('e-add-line-btn').addEventListener('click', ()=>{
    const productCode = document.getElementById('e-product').value;
    const color = document.getElementById('e-color').value;
    const qty = parseInt(document.getElementById('e-qty').value);
    const msg = document.getElementById('e-msg');
    if(!productCode || !qty){ msg.innerHTML = '<div class="msg err">Escolha o produto e a quantidade antes de adicionar à lista.</div>'; return; }
    msg.innerHTML = '';
    entregaLines.push({productCode, color, qty});
    renderEntregaLines();
    document.getElementById('e-qty').value = '';
  });

  document.getElementById('e-add-btn').addEventListener('click', async ()=>{
    const clientCode = document.getElementById('e-client').value;
    const date = document.getElementById('e-date').value;
    const msg = document.getElementById('e-msg');
    if(!clientCode){ msg.innerHTML = '<div class="msg err">Escolha o cliente.</div>'; return; }

    // se não tem nenhum item na listinha, permite lançar rápido só com o que está preenchido no formulário
    let lines = entregaLines.slice();
    if(lines.length === 0){
      const productCode = document.getElementById('e-product').value;
      const color = document.getElementById('e-color').value;
      const qty = parseInt(document.getElementById('e-qty').value);
      if(!productCode || !qty){ msg.innerHTML = '<div class="msg err">Preencha produto e quantidade, ou adicione itens à lista antes de registrar.</div>'; return; }
      lines = [{productCode, color, qty}];
    }

    ENTREGAS = await getJSON('entregas', ENTREGAS);
    const now = Date.now();
    const batchId = 'B' + now; // identifica que esses itens vieram da mesma entrega, pra agrupar no histórico do parceiro
    const termNumber = `TER-${String(date || new Date().toISOString().slice(0,10)).replace(/-/g,'')}-${String(now).slice(-6)}`;
    lines.forEach(line=>{
      const id = nextSeqId(ENTREGAS, 'ENT');
      ENTREGAS.push(withMovementSnapshot({id, date, clientCode, productCode: line.productCode, color: line.color, qty: line.qty, batchId,termNumber},'consignment'));
    });
    await setJSON('entregas', ENTREGAS);
    const savedBatch=ENTREGAS.filter(item=>item.batchId===batchId);
    const totalValue = savedBatch.reduce((s,l)=>s+movementUnitPrice(l)*Number(l.qty), 0);
    lastEntregaTerm = {
      number: termNumber,
      batchId,
      date,
      clientCode,
      client: CLIENTS.find(c=>c.code===clientCode) || {name:clientName(clientCode)},
      items: savedBatch.map(line=>({
        productCode:line.productCode,
        productNameSnapshot:line.productNameSnapshot,
        color:line.color || '',
        qty:Number(line.qty),
        unitPrice:movementUnitPrice(line),
        total:movementUnitPrice(line)*Number(line.qty)
      })),
      totalValue
    };
    msg.innerHTML = `<div class="msg ok">Entrega registrada — ${lines.length} ${lines.length===1?'item':'itens'}, valor total ${fmtMoney(totalValue)}.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button type="button" class="btn secondary" id="e-download-term-btn">Baixar Termo para assinatura</button>
        <button type="button" class="btn secondary" id="e-goto-report-btn">Ver relatório deste cliente</button>
      </div>`;
    document.getElementById('e-download-term-btn').addEventListener('click', ()=>{
      try{ gerarPdfTermoEntrega(lastEntregaTerm); }
      catch(error){ msg.insertAdjacentHTML('beforeend', `<div class="msg err">${escapeHtml(error.message)}</div>`); }
    });
    const clientCodeJustSaved = clientCode;
    document.getElementById('e-goto-report-btn').addEventListener('click', async ()=>{
      await switchAdminTab('relatorio',true,false);
      document.getElementById('rep-client').value = clientCodeJustSaved;
      renderClientReport(clientCodeJustSaved);
    });
    if(document.getElementById('e-generate-term').checked){
      try{ gerarPdfTermoEntrega(lastEntregaTerm); }
      catch(error){ msg.insertAdjacentHTML('beforeend', `<div class="msg err">A entrega foi salva, mas o PDF não abriu: ${escapeHtml(error.message)}</div>`); }
    }
    document.getElementById('e-qty').value = '';
    entregaLines = [];
    renderEntregaLines();
    renderAdminLists();
  });

  document.getElementById('d-add-btn').addEventListener('click', async ()=>{
    const clientCode = document.getElementById('d-client').value;
    const productCode = document.getElementById('d-product').value;
    const color = document.getElementById('d-color').value;
    const qty = parseInt(document.getElementById('d-qty').value);
    const date = document.getElementById('d-date').value;
    const state = document.getElementById('d-state').value;
    const obs = document.getElementById('d-obs').value.trim();
    const msg = document.getElementById('d-msg');
    if(!clientCode || !productCode || !qty){ msg.innerHTML = '<div class="msg err">Preencha cliente, produto e quantidade.</div>'; return; }

    ENTREGAS = await getJSON('entregas', ENTREGAS);
    DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
    ACERTOS = await getJSON('acertos', ACERTOS);
    const sameItemD = r => r.clientCode===clientCode && r.productCode===productCode && (r.color||'')===(color||'');
    const entregueD = ENTREGAS.filter(sameItemD).reduce((s,e)=>s+Number(e.qty),0);
    const devolvidoAntes = DEVOLUCOES.filter(sameItemD).reduce((s,d)=>s+Number(d.qty),0);
    const vendidoD = ACERTOS.filter(sameItemD).reduce((s,a)=>s+Number(a.qty),0);
    const saldoDisponivelD = entregueD - devolvidoAntes - vendidoD;
    if(qty > saldoDisponivelD){
      msg.innerHTML = `<div class="msg err">Esse cliente só tem ${saldoDisponivelD < 0 ? 0 : saldoDisponivelD} unidade(s) desse produto${color ? ' na cor '+color : ''} em posse no momento — não é possível devolver ${qty}.</div>`;
      return;
    }

    const id = nextSeqId(DEVOLUCOES, 'DEV');
    DEVOLUCOES.push(withMovementSnapshot({id, date, clientCode, productCode, color, qty, state, obs},'consignment'));

    let stockMsg = '';
    if(color && state === 'Bom'){
      PRODUCTS = await getJSON('products', PRODUCTS);
      const p = PRODUCTS.find(p=>p.code===productCode);
      const c = p && p.colors ? p.colors.find(c=>c.name===color) : null;
      if(c){
        c.stock = Number(c.stock) + qty;
        await saveJSONBundle({devolucoes:DEVOLUCOES,products:PRODUCTS},'registro da devolução e retorno ao estoque');
        stockMsg = ` ${qty} unidade(s) voltaram ao estoque da cor ${color}.`;
        renderPortfolio();
      }else await setJSON('devolucoes', DEVOLUCOES);
    }else await setJSON('devolucoes', DEVOLUCOES);
    msg.innerHTML = `<div class="msg ok">Devolução registrada.${stockMsg}</div>`;
    document.getElementById('d-qty').value = ''; document.getElementById('d-obs').value = '';
    renderAdminLists();
  });

  document.getElementById('a-add-btn').addEventListener('click', async ()=>{
    const clientCode = document.getElementById('a-client').value;
    const productCode = document.getElementById('a-product').value;
    const color = document.getElementById('a-color').value;
    const qty = parseInt(document.getElementById('a-qty').value);
    const date = document.getElementById('a-date').value;
    const status = document.getElementById('a-status').value;
    const payDate = document.getElementById('a-paydate').value;
    const msg = document.getElementById('a-msg');
    if(!clientCode || !productCode || !qty){ msg.innerHTML = '<div class="msg err">Preencha cliente, produto e quantidade.</div>'; return; }

    ENTREGAS = await getJSON('entregas', ENTREGAS);
    DEVOLUCOES = await getJSON('devolucoes', DEVOLUCOES);
    ACERTOS = await getJSON('acertos', ACERTOS);
    const sameItem = r => r.clientCode===clientCode && r.productCode===productCode && (r.color||'')===(color||'');
    const entregue = ENTREGAS.filter(sameItem).reduce((s,e)=>s+Number(e.qty),0);
    const devolvido = DEVOLUCOES.filter(sameItem).reduce((s,d)=>s+Number(d.qty),0);
    const vendidoAntes = ACERTOS.filter(sameItem).reduce((s,a)=>s+Number(a.qty),0);
    const saldoDisponivel = entregue - devolvido - vendidoAntes;
    if(qty > saldoDisponivel){
      msg.innerHTML = `<div class="msg err">Esse cliente só tem ${saldoDisponivel < 0 ? 0 : saldoDisponivel} unidade(s) desse produto${color ? ' na cor '+color : ''} em posse no momento — não é possível lançar um acerto de ${qty}. Confira as entregas/devoluções/acertos já lançados antes de continuar.</div>`;
      return;
    }

    const id = nextSeqId(ACERTOS, 'ACT');
    ACERTOS.push(withMovementSnapshot({id, date, clientCode, productCode, color, qty, status, payDate},'consignment'));
    await setJSON('acertos', ACERTOS);
    msg.innerHTML = '<div class="msg ok">Acerto registrado.</div>';
    document.getElementById('a-qty').value = '';
    renderAdminLists();
  });

  document.getElementById('v-add-btn').addEventListener('click', async ()=>{
    const clientCode = document.getElementById('v-client').value;
    const productCode = document.getElementById('v-product').value;
    const color = document.getElementById('v-color').value;
    const qty = parseInt(document.getElementById('v-qty').value);
    const total = parseFloat(document.getElementById('v-total').value);
    const date = document.getElementById('v-date').value;
    const obs = document.getElementById('v-obs').value.trim();
    const msg = document.getElementById('v-msg');
    if(!clientCode || !productCode || !qty || isNaN(total)){ msg.innerHTML = '<div class="msg err">Preencha cliente, produto, quantidade e valor total pago.</div>'; return; }
    VENDAS = await getJSON('vendas', VENDAS);
    const id = nextSeqId(VENDAS, 'VD');
    VENDAS.push(withMovementSnapshot({id, date, clientCode, productCode, color, qty, total, obs},'direct'));
    await setJSON('vendas', VENDAS);
    msg.innerHTML = '<div class="msg ok">Venda direta registrada — já aparece no histórico do cliente como comprovante.</div>';
    document.getElementById('v-qty').value = '';
    document.getElementById('v-total').value = '';
    document.getElementById('v-obs').value = '';
    renderAdminLists();
  });

  // ---------- tema claro/escuro (salvo no navegador) ----------
  const THEME_KEY = 'hl_theme';
  function applyTheme(theme){
    const btn = document.getElementById('theme-toggle-btn');
    const mobileBtn=document.getElementById('mobile-theme-toggle-btn');
    if(theme === 'dark'){
      root.classList.add('theme-dark');
      if(btn){btn.title='Ativar modo claro';btn.setAttribute('aria-label','Ativar modo claro');btn.setAttribute('aria-pressed','true');}
      if(mobileBtn){mobileBtn.title='Ativar modo claro';mobileBtn.setAttribute('aria-label','Ativar modo claro');mobileBtn.setAttribute('aria-pressed','true');}
    } else {
      root.classList.remove('theme-dark');
      if(btn){btn.title='Ativar modo escuro';btn.setAttribute('aria-label','Ativar modo escuro');btn.setAttribute('aria-pressed','false');}
      if(mobileBtn){mobileBtn.title='Ativar modo escuro';mobileBtn.setAttribute('aria-label','Ativar modo escuro');mobileBtn.setAttribute('aria-pressed','false');}
    }
  }
  document.getElementById('theme-toggle-btn').addEventListener('click', ()=>{
    const isDark = root.classList.contains('theme-dark');
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  });
  document.getElementById('mobile-theme-toggle-btn').addEventListener('click',()=>{
    const next=root.classList.contains('theme-dark')?'light':'dark';
    applyTheme(next);
    try{localStorage.setItem(THEME_KEY,next);}catch(e){}
  });
  try{
    const savedTheme = localStorage.getItem(THEME_KEY);
    if(savedTheme) applyTheme(savedTheme);
  }catch(e){}

  // ---------- inicialização ----------
  (async function init(){
    const brandLogo = document.getElementById('brand-logo-img');
    if(brandLogo){
      document.querySelectorAll('.cover-logo-full').forEach(img => img.src = brandLogo.src);
      const footerLogo=document.getElementById('footer-logo-img');if(footerLogo)footerLogo.src=brandLogo.src;
    }
    const footerYear=document.getElementById('footer-year');if(footerYear)footerYear.textContent=new Date().getFullYear();
    try{await loadAll();}
    catch(e){
      if(INTERNAL_ADMIN_MODE){
        root.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));document.getElementById('view-admin').classList.add('active');
        document.getElementById('admin-gate-msg').innerHTML=`<div class="msg err">${escapeHtml(e.message)} Recarregue a página para tentar novamente.</div>`;
      }else{
        document.getElementById('portfolio-loading').style.display='none';
        const empty=document.getElementById('portfolio-empty');empty.style.display='block';empty.innerHTML='<div class="glyph">!</div>Não foi possível carregar o catálogo.<br><button type="button" class="btn secondary" id="portfolio-retry-btn" style="margin-top:12px;">Tentar novamente</button>';
        document.getElementById('portfolio-retry-btn').addEventListener('click',()=>location.reload());
      }
      return;
    }
    if(INTERNAL_ADMIN_MODE){
      root.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));
      document.getElementById('view-admin').classList.add('active');
      await checkAdminSessionAndShow();
      return;
    }
    try{
      const savedSession=JSON.parse(sessionStorage.getItem(CLIENT_SESSION_KEY)||'null');
      if(savedSession?.code&&savedSession?.token){
        if(await loadPartnerSnapshot(savedSession.code,savedSession.token))currentPartnerToken=savedSession.token;
        else sessionStorage.removeItem(CLIENT_SESSION_KEY);
      }
    }catch(e){}
    renderPortfolio();
    renderPublicCart();
    if(MERCADO_LIVRE_URL){
      const mlLink = document.getElementById('social-proof-ml-link');
      if(mlLink){ mlLink.href = MERCADO_LIVRE_URL; mlLink.style.display = 'inline-flex'; }
    }
    const customLink = document.getElementById('social-proof-custom-link');
    if(customLink){
      const customMsg = encodeURIComponent('Olá! 😊 Gostaria de saber mais sobre peças personalizadas.');
      customLink.href = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${customMsg}`;
    }
    // se a pessoa chegou por um link direto de produto (#p=CODIGO), abre o produto automaticamente
    const hashMatch = /^#p=(.+)$/.exec(location.hash);
    if(hashMatch){
      const codeFromLink = decodeURIComponent(hashMatch[1]);
      if(PRODUCTS.some(p=>p.code===codeFromLink)){
        openProductModal(codeFromLink);
      }
    }else{
      const savedScroll=Number(sessionStorage.getItem(CATALOG_SCROLL_KEY)||0);
      if(savedScroll>0)requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:savedScroll,behavior:'auto'})));
    }
  })();
})();
