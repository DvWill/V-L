(() => {
  const STORAGE = {
    products: "commerce.products",
    categories: "commerce.categories",
    cart: "commerce.cart",
    coupon: "commerce.coupon",
    orders: "commerce.orders",
    user: "commerce.user",
    theme: "commerce.theme",
  };

  const app = document.getElementById("app");
  const cartCount = document.getElementById("cartCount");
  const cartLink = document.querySelector(".cart-link");
  const searchForm = document.getElementById("globalSearch");
  const searchInput = document.getElementById("searchInput");
  const mobileToggle = document.getElementById("mobileToggle");
  const mobilePanel = document.getElementById("mobilePanel");
  const toastStack = document.getElementById("toastStack");
  const themeToggle = document.getElementById("themeToggle");

  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  // Estado central da loja: produtos editáveis, carrinho, pedidos e filtros ativos.
  const state = {
    products: loadSavedProducts(),
    categories: loadCategories(),
    cart: loadJSON(STORAGE.cart, []),
    coupon: localStorage.getItem(STORAGE.coupon) || "",
    orders: loadJSON(STORAGE.orders, seedOrders()),
    user: loadJSON(STORAGE.user, null),
    filters: defaultFilters(),
    accountTab: "login",
    editingProductId: "",
    theme: currentTheme(),
    paymentConfig: null,
    paymentBrickController: null,
    paymentBrickReady: false,
    filterTimer: null,
  };

  function init() {
    applyTheme(state.theme);
    bindGlobalEvents();
    updateCartCount();
    renderRoute();
    hydrateServerSession();
  }

  function bindGlobalEvents() {
    window.addEventListener("hashchange", renderRoute);

    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      const target = query
        ? `#/categoria/todos?busca=${encodeURIComponent(query)}`
        : "#/categoria/todos";

      if (window.location.hash === target) {
        renderRoute();
      } else {
        window.location.hash = target;
      }
    });

    mobileToggle.addEventListener("click", () => {
      const isOpen = mobilePanel.classList.toggle("open");
      mobileToggle.setAttribute("aria-expanded", String(isOpen));
    });

    themeToggle?.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem(STORAGE.theme, state.theme);
      applyTheme(state.theme);
      toast(`Modo ${state.theme === "dark" ? "escuro" : "claro"} ativado.`);
    });

    mobilePanel.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        closeMobileMenu();
      }
    });

    app.addEventListener("click", handleAppClick);
    app.addEventListener("input", handleAppInput);
    app.addEventListener("change", handleAppChange);
    app.addEventListener("submit", handleAppSubmit);
  }

  // Roteador simples por hash para manter o projeto estático e fácil de publicar.
  function renderRoute() {
    closeMobileMenu();
    const route = parseRoute();

    if (route.name !== "checkout") {
      destroyPaymentBrick();
    }

    if (!route.name) {
      renderHomePage();
    } else if (route.name === "categoria") {
      state.filters = defaultFilters(route.parts[1] || "todos", route.query.get("busca") || "");
      renderCatalogPage();
    } else if (route.name === "produto") {
      renderProductPage(route.parts[1]);
    } else if (route.name === "carrinho") {
      renderCartPage();
    } else if (route.name === "checkout") {
      renderCheckoutPage();
    } else if (route.name === "conta") {
      renderAccountPage(route.query.get("tab") || state.accountTab || "login");
    } else if (route.name === "estoque") {
      renderInventoryPage();
    } else if (route.name === "admin") {
      renderAdminPage();
    } else {
      renderHomePage();
    }

    updateCartCount();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => app.focus({ preventScroll: true }), 0);
  }

  function parseRoute() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const [path = "", queryString = ""] = hash.split("?");
    const parts = path.split("/").filter(Boolean);
    return {
      name: parts[0] || "",
      parts,
      query: new URLSearchParams(queryString),
    };
  }

  // Páginas principais da loja.
  function renderHomePage() {
    searchInput.value = "";
    const featured = state.products.filter((product) => product.featured).slice(0, 10);
    const carouselProducts = [...state.products]
      .filter((product) => product.stock > 0)
      .sort((a, b) => Number(b.launch) - Number(a.launch) || b.sold - a.sold)
      .slice(0, 12);
    const heroProduct = featured[0] || state.products[0];
    const deals = [...state.products].sort((a, b) => b.discount - a.discount).slice(0, 4);
    const miniDeals = deals.slice(1, 4);

    app.innerHTML = `
      <div class="page home-page">
        <section class="hero hero-commerce">
          <div class="hero-copy">
            <span class="eyebrow">Loja demonstrativa white-label</span>
            <h1>Uma vitrine premium para apresentar qualquer operação.</h1>
            <p>
              Commerce Studio é uma base neutra para demonstrar catálogo, carrinho,
              estoque e jornada de compra para diferentes lojistas.
            </p>
            <div class="hero-actions">
              <button class="btn btn-primary" type="button" data-action="scroll-section" data-target="vitrine">${icon("shoppingBag")} Ver vitrine</button>
              <a class="btn btn-light" href="#/estoque">${icon("boxes")} Gerenciar estoque</a>
            </div>
            <div class="hero-proof">
              <div class="proof-item">
                <strong>${state.products.length}</strong>
                <span>produtos no catálogo</span>
              </div>
              <div class="proof-item">
                <strong>${totalStock()}</strong>
                <span>unidades em estoque</span>
              </div>
              <div class="proof-item">
                <strong>${money(inventoryTotals().value)}</strong>
                <span>valor em vitrine</span>
              </div>
            </div>
          </div>
          <div class="hero-stage" aria-label="Produto em destaque">
            <span class="stage-ribbon">Vitrine ativa</span>
            <div class="floating-card top">
              <strong>${heroProduct.name}</strong>
              <span>A partir de ${money(heroProduct.price)}</span>
            </div>
            <div class="hero-product-orbit">
              <span class="hero-spotlight"></span>
              ${productVisual(heroProduct)}
            </div>
            <div class="floating-card bottom">
              <strong>${heroProduct.stock} unidades</strong>
              <span>${stockStatus(heroProduct).label}</span>
            </div>
          </div>
        </section>

        <section class="section carousel-section" aria-labelledby="carouselTitle">
          <div class="section-head">
            <div>
              <p class="section-kicker">Carrossel</p>
              <h2 id="carouselTitle">Produtos em movimento para chamar atenção.</h2>
              <p class="section-copy">
                Destaques roláveis com preço, estoque e ação rápida, ideal para a primeira dobra da loja.
              </p>
            </div>
            <div class="carousel-controls" aria-label="Controles do carrossel">
              <button class="round-action" type="button" data-action="scroll-carousel" data-carousel="homeCarousel" data-direction="-1" aria-label="Voltar produtos">${icon("chevronLeft")}</button>
              <button class="round-action" type="button" data-action="scroll-carousel" data-carousel="homeCarousel" data-direction="1" aria-label="Avançar produtos">${icon("chevronRight")}</button>
            </div>
          </div>
          ${productCarousel(carouselProducts, "homeCarousel")}
        </section>

        <section class="section" id="vitrine">
          <div class="section-head">
            <div>
              <p class="section-kicker">Vitrine</p>
              <h2>Uma composição pronta para apresentação comercial.</h2>
              <p class="section-copy">
                Um produto principal ganha espaço editorial, enquanto os demais ficam organizados
                para leitura rápida como em uma vitrine real.
              </p>
            </div>
            <a class="text-link" href="#/categoria/todos">Explorar catálogo</a>
          </div>
          <div class="showcase-layout">
            <article class="showcase-feature">
              <div class="showcase-media">${productVisual(heroProduct)}</div>
              <div class="showcase-copy">
                <span class="section-kicker">${categoryName(heroProduct.category)}</span>
                <h3>${heroProduct.name}</h3>
                <p>${heroProduct.description}</p>
                <div class="price-row">
                  <span class="price">${money(heroProduct.price)}</span>
                  <span class="cash-label">${heroProduct.installments}x sem juros</span>
                </div>
                <a class="btn btn-primary" href="#/produto/${heroProduct.id}">${icon("arrow")} Ver produto</a>
              </div>
            </article>
            <div class="showcase-grid">
              ${featured.slice(1, 7).map(showcaseItem).join("")}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="section-kicker">Categorias</p>
              <h2>Encontre por uso, produto ou acessório.</h2>
            </div>
            <a class="text-link" href="#/categoria/todos">Ver tudo</a>
          </div>
          <div class="category-grid">
            ${state.categories
              .filter((category) => category.featured)
              .map(categoryCard)
              .join("")}
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="section-kicker">Grade comercial</p>
              <h2>Cards completos para compra rápida.</h2>
              <p class="section-copy">
                Preço, parcelamento, avaliações, estoque e atalhos de detalhe em uma grade responsiva.
              </p>
            </div>
            <a class="text-link" href="#/categoria/todos">Explorar vitrine</a>
          </div>
          ${productGrid(featured)}
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="section-kicker">Marketplace</p>
              <h2>Ofertas com leitura rápida e decisão simples.</h2>
            </div>
          </div>
          <div class="market-strip">
            <article class="deal-panel">
              <h3>${deals[0].discount}% off em ${deals[0].name}</h3>
              <p>
                Simulação de promoção com preço à vista, parcelamento e estoque
                controlado, pronta para evoluir para integrações reais.
              </p>
              <a class="btn btn-primary" href="#/produto/${deals[0].id}">Ver oferta</a>
            </article>
            <div class="deal-list">
              ${miniDeals.map(miniDealCard).join("")}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="section-kicker">Benefícios</p>
              <h2>Confiança para comprar tecnologia.</h2>
            </div>
          </div>
          <div class="benefit-grid">
            ${benefitCard("Entrega rápida", "Envio simulado em até 24h para capitais e rastreio desde a separação.", icon("truck"))}
            ${benefitCard("Garantia", "Produtos com procedência informada, nota e suporte para pós-venda.", icon("shield"))}
            ${benefitCard("Pagamento seguro", "Checkout preparado para Pix, cartão e boleto com resumo transparente.", icon("lock"))}
            ${benefitCard("Estoque visível", "Página dedicada para acompanhar quantidade, valor parado e reposição.", icon("boxes"))}
          </div>
        </section>
      </div>
    `;
  }

  function renderCatalogPage() {
    searchInput.value = state.filters.search || "";
    const filtered = getFilteredProducts();
    const title = catalogTitle();
    const allModels = unique(state.products.map((product) => product.model));
    const brands = unique(state.products.map((product) => product.brand));
    const colors = unique(state.products.flatMap((product) => product.colors));
    const storages = unique(state.products.flatMap((product) => product.storages));

    app.innerHTML = `
      <div class="page">
        <header class="catalog-header">
          <div>
            <h1>${title}</h1>
            <p>${filtered.length} produto${filtered.length === 1 ? "" : "s"} encontrado${filtered.length === 1 ? "" : "s"} com filtros de preço, modelo, cor, armazenamento, marca e avaliação.</p>
          </div>
          <label class="sort-row">
            <span class="muted">Ordenar</span>
            <select class="select" id="catalogSort" data-filter-input>
              ${sortOption("relevance", "Relevância")}
              ${sortOption("menor-preco", "Menor preço")}
              ${sortOption("maior-preco", "Maior preço")}
              ${sortOption("mais-vendidos", "Mais vendidos")}
              ${sortOption("lancamentos", "Lançamentos")}
            </select>
          </label>
        </header>

        <div class="catalog-layout">
          <aside class="filters-panel">
            <form id="filterForm">
              <h2>Filtros</h2>

              <div class="filter-group">
                <h3>Preço</h3>
                <div class="price-filter">
                  <input class="input" data-filter-input name="min" type="number" min="0" placeholder="Mín." value="${state.filters.min || ""}" />
                  <input class="input" data-filter-input name="max" type="number" min="0" placeholder="Máx." value="${state.filters.max || ""}" />
                </div>
              </div>

              ${checkGroup("Modelo", "models", allModels)}
              ${checkGroup("Armazenamento", "storages", storages)}
              ${checkGroup("Marca", "brands", brands)}

              <div class="filter-group">
                <h3>Cor</h3>
                <div class="color-filter">
                  ${colors
                    .map(
                      (color) => `
                        <label class="color-chip" style="--dot: ${colorToCss(color)}">
                          <input data-filter-input type="checkbox" name="colors" value="${escapeAttr(color)}" ${checked(state.filters.colors, color)} />
                          <span class="color-dot"></span>
                          <span>${color}</span>
                        </label>
                      `
                    )
                    .join("")}
                </div>
              </div>

              <div class="filter-group">
                <h3>Avaliação</h3>
                <label class="check-row">
                  <input data-filter-input type="radio" name="rating" value="" ${state.filters.rating ? "" : "checked"} />
                  Todas
                </label>
                <label class="check-row">
                  <input data-filter-input type="radio" name="rating" value="4.5" ${state.filters.rating === "4.5" ? "checked" : ""} />
                  4,5 estrelas ou mais
                </label>
                <label class="check-row">
                  <input data-filter-input type="radio" name="rating" value="4.8" ${state.filters.rating === "4.8" ? "checked" : ""} />
                  4,8 estrelas ou mais
                </label>
              </div>

              <button class="btn btn-light btn-full" type="button" data-action="clear-filters">Limpar filtros</button>
            </form>
          </aside>

          <section class="catalog-products">
            ${
              filtered.length
                ? productGrid(filtered)
                : `<div class="empty-state glass-card">
                    <div>
                      <h2>Nenhum produto encontrado</h2>
                      <p>Ajuste os filtros ou faça uma nova busca.</p>
                      <button class="btn btn-primary" type="button" data-action="clear-filters">Limpar filtros</button>
                    </div>
                  </div>`
            }
          </section>
        </div>
      </div>
    `;
  }

  function renderProductPage(productId) {
    const product = findProduct(productId);

    if (!product) {
      renderNotFound("Produto não encontrado", "O item pode ter sido removido no painel administrativo.");
      return;
    }

    const related = state.products
      .filter((item) => item.category === product.category && item.id !== product.id)
      .slice(0, 4);

    app.innerHTML = `
      <div class="page">
        <div class="detail-layout">
          <section class="gallery" aria-label="Galeria do produto">
            <div class="thumbs">
              ${[0, 1, 2, 3].map(() => `<button class="thumb" type="button">${productVisual(product)}</button>`).join("")}
            </div>
            <div class="main-media">
              ${productVisual(product)}
            </div>
          </section>

          <section class="detail-info glass-card">
            <p class="section-kicker">${categoryName(product.category)}</p>
            <h1>${product.name}</h1>
            <div class="detail-rating">
              <span class="rating">${stars(product.rating)} ${product.rating.toFixed(1)}</span>
              <span>${product.reviews} avaliações</span>
              <span>${product.stock} em estoque</span>
            </div>

            <div class="detail-price">
              <p class="old-price">${product.oldPrice > product.price ? money(product.oldPrice) : ""}</p>
              <div class="price-row">
                <span class="price">${money(product.price)}</span>
                <span class="cash-label">à vista</span>
              </div>
              <p class="installments">ou ${product.installments}x de ${money(product.price / product.installments)} sem juros</p>
            </div>

            ${optionGroup("Cor", "color", product.colors)}
            ${optionGroup("Armazenamento", "storage", product.storages)}

            <div class="detail-actions">
              <button class="btn btn-dark" type="button" data-action="add-cart" data-product-id="${product.id}">
                Adicionar ao carrinho
              </button>
              <button class="btn btn-primary" type="button" data-action="buy-now" data-product-id="${product.id}">
                Comprar agora
              </button>
            </div>

            <div class="option-group">
              <div class="option-title">Descrição técnica</div>
              <p class="section-copy">${product.description}</p>
              <ul class="spec-list">
                ${product.specs.map((spec) => `<li>${spec}</li>`).join("")}
              </ul>
            </div>
          </section>
        </div>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="section-kicker">Relacionados</p>
              <h2>Combine com o seu produto.</h2>
            </div>
            <a class="text-link" href="#/categoria/${product.category}">Ver categoria</a>
          </div>
          ${productGrid(related.length ? related : state.products.filter((item) => item.id !== product.id).slice(0, 4))}
        </section>
      </div>
    `;
  }

  function renderCartPage() {
    const rows = cartRows();

    app.innerHTML = `
      <div class="page">
        <header class="catalog-header">
          <div>
            <h1>Carrinho</h1>
            <p>Revise os itens, ajuste quantidades, aplique cupom e avance para o checkout simulado.</p>
          </div>
        </header>

        ${
          rows.length
            ? `<div class="cart-layout">
                <section class="cart-list">
                  ${rows.map(cartItem).join("")}
                </section>
                ${summaryCard({ checkout: true, coupon: true })}
              </div>`
            : emptyCart()
        }
      </div>
    `;
  }

  function renderCheckoutPage() {
    const rows = cartRows();

    destroyPaymentBrick();

    if (!rows.length) {
      app.innerHTML = `
        <div class="page">
          ${emptyCart("Seu carrinho está vazio", "Adicione produtos antes de finalizar a compra.")}
        </div>
      `;
      return;
    }

    if (!isLoggedIn()) {
      app.innerHTML = `
        <div class="page">
          <div class="empty-state glass-card login-required">
            <div>
              <p class="section-kicker">Login obrigatório</p>
              <h2>Entre na sua conta para finalizar a compra.</h2>
              <p>Por segurança, o pagamento só é liberado para clientes logados. Depois do login, seu carrinho continua salvo.</p>
              <div class="hero-actions">
                <a class="btn btn-primary" href="#/conta?tab=login">${icon("user")} Entrar</a>
                <a class="btn btn-light" href="#/conta?tab=cadastro">Criar conta</a>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    app.innerHTML = `
      <div class="page">
        <header class="catalog-header">
          <div>
            <h1>Checkout seguro</h1>
            <p>Pagamento integrado ao Mercado Pago para Pix, cartão de crédito e cartão de débito.</p>
          </div>
        </header>

        <form class="checkout-layout" data-form="checkout">
          <section>
            <div class="form-card">
              <h2>Dados do cliente</h2>
              <div class="form-grid">
                ${field("Nome completo", "name", "text", state.user?.name || "", true)}
                ${field("E-mail", "email", "email", state.user?.email || "", true)}
                ${field("Telefone", "phone", "tel", state.user?.phone || "", true)}
                ${field("CPF", "document", "text", "", true)}
              </div>
            </div>

            <div class="form-card">
              <h2>Endereço de entrega</h2>
              <div class="form-grid">
                ${field("CEP", "zip", "text", state.user?.address?.zip || "", true)}
                ${field("Cidade", "city", "text", state.user?.address?.city || "", true)}
                ${field("Rua", "street", "text", state.user?.address?.street || "", true, "span-2")}
                ${field("Número", "number", "text", state.user?.address?.number || "", true)}
                ${field("Complemento", "complement", "text", state.user?.address?.complement || "", false)}
              </div>
            </div>

            <div class="form-card">
              <h2>Forma de pagamento</h2>
              <div class="payment-options">
                ${paymentOption("Pix", "QR Code e copia-e-cola", "pix", true)}
                ${paymentOption("Crédito", "Token seguro Mercado Pago", "credit_card", false)}
                ${paymentOption("Débito", "Cartão de débito online", "debit_card", false)}
              </div>
              <div class="payment-api-panel">
                <div class="payment-api-head">
                  <span class="benefit-icon">${icon("lock")}</span>
                  <div>
                    <strong>Mercado Pago Checkout Transparente</strong>
                    <p>Os dados de cartão são tokenizados pelo SDK oficial. A chave secreta fica somente no servidor.</p>
                  </div>
                </div>
                <div id="paymentSetupNotice" class="payment-notice">
                  Conectando ao backend de pagamento...
                </div>
                <div id="cardPaymentBrick_container" class="card-brick-shell" aria-live="polite"></div>
                <div id="paymentResult" class="payment-result" aria-live="polite"></div>
              </div>
            </div>
          </section>

          ${summaryCard({ checkout: false, coupon: false, submit: true, submitLabel: "Gerar pagamento" })}
        </form>
      </div>
    `;

    setTimeout(initializeCheckoutPayments, 0);
  }

  function renderAccountPage(tab = "login") {
    state.accountTab = tab;
    const tabs = [
      ["login", "Login"],
      ["cadastro", "Cadastro"],
      ["pedidos", "Meus pedidos"],
      ["dados", "Dados pessoais"],
      ["enderecos", "Endereços"],
    ];

    app.innerHTML = `
      <div class="page">
        <header class="catalog-header">
          <div>
            <h1>Área do cliente</h1>
            <p>Login, cadastro, pedidos, dados pessoais e endereços salvos em uma área simples e clara.</p>
          </div>
        </header>

        <div class="account-layout">
          <section class="form-card account-panel">
            <div class="tabs">
              ${tabs
                .map(
                  ([id, label]) => `
                    <button class="tab-btn ${tab === id ? "active" : ""}" type="button" data-action="account-tab" data-tab="${id}">
                      ${label}
                    </button>
                  `
                )
                .join("")}
            </div>
            ${accountContent(tab)}
          </section>

          <aside class="summary-card">
            <h2>${state.user ? state.user.name : "Cliente Demo"}</h2>
            <p class="muted">
              ${state.user ? "Conta local ativa para simular pedidos e endereços." : "Entre ou cadastre-se para preencher checkout e acompanhar pedidos."}
            </p>
            <div class="summary-line">
              <span>Pedidos</span>
              <strong>${state.orders.length}</strong>
            </div>
            <div class="summary-line">
              <span>Itens no carrinho</span>
              <strong>${state.cart.reduce((sum, item) => sum + item.qty, 0)}</strong>
            </div>
            <a class="btn btn-light btn-full" href="#/carrinho">Ver carrinho</a>
          </aside>
        </div>
      </div>
    `;
  }

  function renderAdminPage() {
    const totals = adminTotals();
    const editing = state.editingProductId ? findProduct(state.editingProductId) : null;

    app.innerHTML = `
      <div class="page">
        <header class="catalog-header">
          <div>
            <h1>Painel administrativo</h1>
            <p>Gerencie produtos, categorias, estoque e pedidos com dados mockados persistidos no navegador.</p>
          </div>
          <button class="btn btn-light" type="button" data-action="reset-products">Restaurar mock</button>
        </header>

        <section class="admin-layout">
          <div class="admin-stats">
            ${statCard("Faturamento", money(totals.revenue))}
            ${statCard("Pedidos", totals.orders)}
            ${statCard("Produtos", state.products.length)}
            ${statCard("Estoque baixo", totals.lowStock)}
          </div>

          <div class="admin-grid">
            <section class="admin-card">
              <h2>${editing ? "Editar produto" : "Adicionar produto"}</h2>
              <form data-form="admin-product">
                <input type="hidden" name="id" value="${editing?.id || ""}" />
                <div class="form-grid">
                  ${field("Nome", "name", "text", editing?.name || "", true, "span-2")}
                  <label class="field">
                    <span>Categoria</span>
                    <select class="select" name="category" required>
                      ${state.categories
                        .map((category) => `<option value="${category.id}" ${editing?.category === category.id ? "selected" : ""}>${category.name}</option>`)
                        .join("")}
                    </select>
                  </label>
                  ${field("Marca", "brand", "text", editing?.brand || "Marca própria", true)}
                  ${field("Modelo", "model", "text", editing?.model || "", true)}
                  ${field("Preço", "price", "number", editing?.price || "", true)}
                  ${field("Preço antigo", "oldPrice", "number", editing?.oldPrice || "", false)}
                  ${field("Desconto (%)", "discount", "number", editing?.discount || 0, false)}
                  ${field("Estoque", "stock", "number", editing?.stock || 0, true)}
                  ${field("Avaliação", "rating", "number", editing?.rating || 4.7, true)}
                  ${field("Cores (separe por vírgula)", "colors", "text", editing?.colors?.join(", ") || "Preto, Branco", true, "span-2")}
                  ${field("Variações (separe por vírgula)", "storages", "text", editing?.storages?.join(", ") || "Padrão", true, "span-2")}
                  <label class="field span-2">
                    <span>Descrição</span>
                    <textarea class="textarea" name="description" required>${editing?.description || ""}</textarea>
                  </label>
                  <label class="field span-2">
                    <span>Especificações (uma por linha)</span>
                    <textarea class="textarea" name="specs">${editing?.specs?.join("\n") || ""}</textarea>
                  </label>
                  <label class="check-row">
                    <input type="checkbox" name="featured" ${editing?.featured ? "checked" : ""} />
                    Destaque
                  </label>
                  <label class="check-row">
                    <input type="checkbox" name="launch" ${editing?.launch ? "checked" : ""} />
                    Lançamento
                  </label>
                </div>
                <div class="hero-actions">
                  <button class="btn btn-primary" type="submit">${editing ? "Salvar alterações" : "Adicionar produto"}</button>
                  ${editing ? `<button class="btn btn-light" type="button" data-action="cancel-edit">Cancelar</button>` : ""}
                </div>
              </form>
            </section>

            <section class="admin-card">
              <h2>Produtos e estoque</h2>
              <div class="table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th>Preço</th>
                      <th>Estoque</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.products.map(productTableRow).join("")}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div class="admin-grid">
            <section class="admin-card">
              <h2>Categorias</h2>
              <form class="coupon-row" data-form="category">
                <input class="input" name="name" type="text" placeholder="Nova categoria" required />
                <button class="btn btn-dark" type="submit">Adicionar</button>
              </form>
              <div class="order-list">
                ${state.categories.map(categoryAdminRow).join("")}
              </div>
            </section>

            <section class="admin-card">
              <h2>Pedidos</h2>
              <div class="table-wrap">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.orders.length ? state.orders.map(orderTableRow).join("") : `<tr><td colspan="4">Nenhum pedido ainda.</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>
    `;
  }

  function renderInventoryPage() {
    const totals = inventoryTotals();
    const sortedProducts = [...state.products].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "pt-BR"));
    const lowStock = sortedProducts.filter((product) => product.stock <= 10);

    app.innerHTML = `
      <div class="page">
        <header class="catalog-header inventory-header">
          <div>
            <p class="section-kicker">Estoque</p>
            <h1>Gerenciamento de estoque</h1>
            <p>Acompanhe quantidades, valor parado, produtos críticos e ajuste rápido de unidades sem sair da loja.</p>
          </div>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/admin">${icon("settings")} Cadastrar produto</a>
            <button class="btn btn-light" type="button" data-action="reset-products">${icon("refresh")} Restaurar mock</button>
          </div>
        </header>

        <section class="admin-layout">
          <div class="admin-stats">
            ${statCard("Itens cadastrados", state.products.length)}
            ${statCard("Unidades totais", totals.units)}
            ${statCard("Valor em estoque", money(totals.value))}
            ${statCard("Reposição urgente", totals.critical)}
          </div>

          <div class="inventory-board">
            <article class="inventory-card">
              <div class="section-head compact">
                <div>
                  <p class="section-kicker">Prioridade</p>
                  <h2>Produtos com estoque baixo</h2>
                </div>
                <a class="text-link" href="#/categoria/todos">Ver catálogo</a>
              </div>
              <div class="restock-list">
                ${
                  lowStock.length
                    ? lowStock.slice(0, 6).map(restockItem).join("")
                    : `<div class="empty-state glass-card"><div><h2>Estoque saudável</h2><p>Nenhum item está abaixo do limite de atenção.</p></div></div>`
                }
              </div>
            </article>

            <article class="inventory-card">
              <div class="section-head compact">
                <div>
                  <p class="section-kicker">Tabela</p>
                  <h2>Controle rápido</h2>
                </div>
                <span class="muted">${sortedProducts.length} produtos</span>
              </div>
              <div class="table-wrap">
                <table class="admin-table inventory-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th>Status</th>
                      <th>Estoque</th>
                      <th>Valor parado</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sortedProducts.map(inventoryTableRow).join("")}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
      </div>
    `;
  }

  // Delegação de eventos mantém os componentes renderizados dinamicamente leves.
  function handleAppClick(event) {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;

    const action = actionElement.dataset.action;

    if (action === "add-cart") {
      event.preventDefault();
      addToCart(actionElement.dataset.productId, selectedOptions(actionElement.dataset.productId));
    }

    if (action === "buy-now") {
      event.preventDefault();
      addToCart(actionElement.dataset.productId, selectedOptions(actionElement.dataset.productId), false);
      window.location.hash = "#/checkout";
    }

    if (action === "select-option") {
      const group = actionElement.closest("[data-option-group]");
      group.querySelectorAll(".pill").forEach((button) => button.classList.remove("active"));
      actionElement.classList.add("active");
    }

    if (action === "increase" || action === "decrease") {
      updateCartQuantity(actionElement.dataset.key, action === "increase" ? 1 : -1);
      renderCartPage();
    }

    if (action === "remove-item") {
      removeCartItem(actionElement.dataset.key);
      renderCartPage();
    }

    if (action === "apply-coupon") {
      applyCoupon();
      renderCartPage();
    }

    if (action === "clear-filters") {
      state.filters = defaultFilters(state.filters.category, state.filters.search);
      renderCatalogPage();
    }

    if (action === "scroll-section") {
      const target = document.getElementById(actionElement.dataset.target);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (action === "scroll-carousel") {
      const carousel = document.getElementById(actionElement.dataset.carousel);
      const direction = Number(actionElement.dataset.direction) || 1;
      carousel?.scrollBy({ left: direction * Math.min(carousel.clientWidth * 0.84, 920), behavior: "smooth" });
    }

    if (action === "stock-adjust") {
      adjustStock(actionElement.dataset.productId, Number(actionElement.dataset.delta) || 0);
    }

    if (action === "account-tab") {
      renderAccountPage(actionElement.dataset.tab);
    }

    if (action === "edit-product") {
      state.editingProductId = actionElement.dataset.productId;
      if (parseRoute().name !== "admin") {
        window.location.hash = "#/admin";
      } else {
        renderAdminPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }

    if (action === "delete-product") {
      deleteProduct(actionElement.dataset.productId);
    }

    if (action === "cancel-edit") {
      state.editingProductId = "";
      renderAdminPage();
    }

    if (action === "reset-products") {
      resetProducts();
    }

    if (action === "delete-category") {
      deleteCategory(actionElement.dataset.categoryId);
    }
  }

  function handleAppInput(event) {
    if (!event.target.matches("[data-filter-input]")) return;
    clearTimeout(state.filterTimer);
    state.filterTimer = setTimeout(() => {
      readFiltersFromPage();
      renderCatalogPage();
    }, 220);
  }

  function handleAppChange(event) {
    if (event.target.matches("[data-filter-input]")) {
      readFiltersFromPage();
      renderCatalogPage();
    }

    if (event.target.matches('input[name="payment"]')) {
      refreshPaymentPanel();
    }

    if (event.target.matches("[data-order-status]")) {
      const order = state.orders.find((item) => item.id === event.target.dataset.orderId);
      if (order) {
        order.status = event.target.value;
        saveJSON(STORAGE.orders, state.orders);
        toast("Status do pedido atualizado.");
      }
    }
  }

  function handleAppSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();

    const type = form.dataset.form;

    if (type === "checkout") {
      submitCheckout(form);
    }

    if (type === "login") {
      submitLogin(form);
    }

    if (type === "register") {
      submitRegister(form);
    }

    if (type === "profile") {
      submitProfile(form);
    }

    if (type === "address") {
      submitAddress(form);
    }

    if (type === "admin-product") {
      submitAdminProduct(form);
    }

    if (type === "category") {
      submitCategory(form);
    }
  }

  function productGrid(products) {
    return `<div class="product-grid">${products.map(productCard).join("")}</div>`;
  }

  function productCarousel(products, id) {
    return `
      <div class="product-carousel" id="${id}" tabindex="0" aria-label="Carrossel de produtos">
        ${products.map((product) => `<div class="carousel-slide">${productCard(product)}</div>`).join("")}
      </div>
    `;
  }

  function productCard(product) {
    const status = stockStatus(product);
    return `
      <article class="product-card">
        <a class="product-card-top" href="#/produto/${product.id}" aria-label="Ver ${product.name}">
          ${product.discount ? `<span class="discount-badge">${product.discount}% off</span>` : ""}
          <span class="stock-badge ${status.className}">${status.label}</span>
          ${productVisual(product)}
        </a>
        <div class="product-card-body">
          <div class="product-meta">
            <span>${categoryName(product.category)}</span>
            <span class="rating">${stars(product.rating)} ${product.rating.toFixed(1)}</span>
          </div>
          <h3>${product.name}</h3>
          <p class="old-price">${product.oldPrice > product.price ? money(product.oldPrice) : ""}</p>
          <div class="price-row">
            <span class="price">${money(product.price)}</span>
            <span class="cash-label">Pix</span>
          </div>
          <p class="installments">${product.installments}x de ${money(product.price / product.installments)} sem juros</p>
        </div>
        <div class="product-card-actions">
          <button class="btn btn-dark" type="button" data-action="add-cart" data-product-id="${product.id}">
            Comprar
          </button>
          <a class="round-action" href="#/produto/${product.id}" aria-label="Detalhes de ${product.name}">
            ${icon("arrow")}
          </a>
        </div>
      </article>
    `;
  }

  function showcaseItem(product) {
    const status = stockStatus(product);
    return `
      <a class="showcase-item" href="#/produto/${product.id}">
        <span class="showcase-thumb">${productVisual(product)}</span>
        <span>
          <strong>${product.name}</strong>
          <small>${categoryName(product.category)} · ${status.label}</small>
          <span class="price">${money(product.price)}</span>
        </span>
      </a>
    `;
  }

  function categoryCard(category) {
    const target = category.id === "acessorios" ? "#/categoria/acessorios" : `#/categoria/${category.id}`;
    return `
      <a class="category-card" href="${target}">
        <span class="category-icon icon-${category.icon}" aria-hidden="true"></span>
        <span>
          <strong>${category.name}</strong>
          <span>${category.label}</span>
        </span>
      </a>
    `;
  }

  function miniDealCard(product) {
    return `
      <a class="mini-deal" href="#/produto/${product.id}">
        <span class="mini-art">${productVisual(product)}</span>
        <span>
          <h4>${product.name}</h4>
          <p>${product.discount}% de desconto e ${product.stock} unidades em estoque</p>
        </span>
        <span class="mini-price">
          <strong>${money(product.price)}</strong>
          <span>${product.installments}x sem juros</span>
        </span>
      </a>
    `;
  }

  function benefitCard(title, copy, svg) {
    return `
      <article class="benefit-card">
        <span class="benefit-icon">${svg}</span>
        <h3>${title}</h3>
        <p>${copy}</p>
      </article>
    `;
  }

  // Visuais de produto em icones para manter a vitrine limpa e neutra.
  function productVisual(product) {
    const tone = product.visual?.tone || "midnight";
    const type = product.visual?.type || visualForCategory(product.category).type;

    return `
      <span class="product-art product-icon-art product-icon-${type} tone-${tone}" role="img" aria-label="${escapeAttr(product.name)}">
        <span class="product-icon-shell">${icon(productIcon(type))}</span>
      </span>
    `;
  }

  function productIcon(type) {
    const icons = {
      battery: "productBattery",
      buds: "productEarbuds",
      cable: "productCable",
      case: "productCase",
      charger: "productCharger",
      glass: "productGlass",
      mount: "productMount",
      phone: "productPhone",
      tablet: "productTablet",
      watch: "productWatch",
    };
    return icons[type] || icons.case;
  }

  function getFilteredProducts() {
    const filters = state.filters;
    const search = normalize(filters.search);

    let items = state.products.filter((product) => {
      const inCategory =
        filters.category === "todos" ||
        (filters.category === "ofertas" && product.discount >= 10) ||
        product.category === filters.category;

      const inSearch =
        !search ||
        normalize(
          [
            product.name,
            product.model,
            product.brand,
            product.category,
            product.description,
            ...(product.tags || []),
          ].join(" ")
        ).includes(search);

      const inPrice =
        (!filters.min || product.price >= Number(filters.min)) &&
        (!filters.max || product.price <= Number(filters.max));

      const inModels = !filters.models.length || filters.models.includes(product.model);
      const inColors = !filters.colors.length || product.colors.some((color) => filters.colors.includes(color));
      const inStorage = !filters.storages.length || product.storages.some((storage) => filters.storages.includes(storage));
      const inBrands = !filters.brands.length || filters.brands.includes(product.brand);
      const inRating = !filters.rating || product.rating >= Number(filters.rating);

      return inCategory && inSearch && inPrice && inModels && inColors && inStorage && inBrands && inRating;
    });

    items = [...items].sort((a, b) => {
      if (filters.sort === "menor-preco") return a.price - b.price;
      if (filters.sort === "maior-preco") return b.price - a.price;
      if (filters.sort === "mais-vendidos") return b.sold - a.sold;
      if (filters.sort === "lancamentos") return Number(b.launch) - Number(a.launch) || b.sold - a.sold;
      return Number(b.featured) - Number(a.featured) || b.rating - a.rating || b.sold - a.sold;
    });

    return items;
  }

  function readFiltersFromPage() {
    const form = app.querySelector("#filterForm");
    if (!form) return;

    const checkedValues = (name) =>
      [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);

    state.filters = {
      ...state.filters,
      min: form.elements.min.value,
      max: form.elements.max.value,
      models: checkedValues("models"),
      colors: checkedValues("colors"),
      storages: checkedValues("storages"),
      brands: checkedValues("brands"),
      rating: form.querySelector('input[name="rating"]:checked')?.value || "",
      sort: app.querySelector("#catalogSort")?.value || "relevance",
    };
  }

  function checkGroup(title, name, values) {
    return `
      <div class="filter-group">
        <h3>${title}</h3>
        <div class="check-list">
          ${values
            .map(
              (value) => `
                <label class="check-row">
                  <input data-filter-input type="checkbox" name="${name}" value="${escapeAttr(value)}" ${checked(state.filters[name], value)} />
                  ${value}
                </label>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function sortOption(value, label) {
    return `<option value="${value}" ${state.filters.sort === value ? "selected" : ""}>${label}</option>`;
  }

  function optionGroup(title, name, values) {
    return `
      <div class="option-group" data-option-group="${name}">
        <div class="option-title">
          <span>${title}</span>
          <span class="muted">${values[0] || "Padrão"}</span>
        </div>
        <div class="pill-list">
          ${values
            .map(
              (value, index) => `
                <button class="pill ${index === 0 ? "active" : ""}" type="button" data-action="select-option" data-value="${escapeAttr(value)}">
                  ${value}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function selectedOptions(productId) {
    const product = findProduct(productId);
    const color = app.querySelector('[data-option-group="color"] .pill.active')?.dataset.value || product?.colors?.[0] || "Padrão";
    const storage = app.querySelector('[data-option-group="storage"] .pill.active')?.dataset.value || product?.storages?.[0] || "Padrão";
    return { color, storage };
  }

  // Carrinho persistido em localStorage, já preparado para trocar por uma API no futuro.
  function addToCart(productId, options = {}, showMessage = true) {
    const product = findProduct(productId);
    if (!product) return;

    const color = options.color || product.colors[0] || "Padrão";
    const storage = options.storage || product.storages[0] || "Padrão";
    const key = `${product.id}|${color}|${storage}`;
    const existing = state.cart.find((item) => item.key === key);

    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({
        key,
        id: product.id,
        color,
        storage,
        qty: 1,
        priceAtAdd: product.price,
      });
    }

    saveJSON(STORAGE.cart, state.cart);
    updateCartCount(true);
    if (showMessage) toast(`${product.name} adicionado ao carrinho.`);
  }

  function updateCartQuantity(key, delta) {
    const item = state.cart.find((entry) => entry.key === key);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      state.cart = state.cart.filter((entry) => entry.key !== key);
    }
    saveJSON(STORAGE.cart, state.cart);
    updateCartCount();
  }

  function removeCartItem(key) {
    state.cart = state.cart.filter((item) => item.key !== key);
    saveJSON(STORAGE.cart, state.cart);
    updateCartCount();
    toast("Item removido do carrinho.");
  }

  function cartRows() {
    return state.cart
      .map((item) => ({
        ...item,
        product: findProduct(item.id),
      }))
      .filter((item) => item.product);
  }

  function cartItem(item) {
    const product = item.product;
    return `
      <article class="cart-item glass-card">
        <div class="cart-item-media">${productVisual(product)}</div>
        <div>
          <h3>${product.name}</h3>
          <p>${item.color} · ${item.storage}</p>
          <p>${money(product.price)} por unidade</p>
          <div class="qty-control" aria-label="Quantidade de ${product.name}">
            <button type="button" data-action="decrease" data-key="${escapeAttr(item.key)}">-</button>
            <span>${item.qty}</span>
            <button type="button" data-action="increase" data-key="${escapeAttr(item.key)}">+</button>
          </div>
        </div>
        <div class="cart-item-price">
          <strong>${money(product.price * item.qty)}</strong>
          <button class="remove-btn" type="button" data-action="remove-item" data-key="${escapeAttr(item.key)}">Remover</button>
        </div>
      </article>
    `;
  }

  function totals() {
    const subtotal = cartRows().reduce((sum, item) => sum + item.product.price * item.qty, 0);
    const couponValid = state.coupon.trim().toUpperCase() === "COMMERCE10";
    const discount = couponValid ? subtotal * 0.1 : 0;
    const shipping = subtotal === 0 || subtotal >= 1500 ? 0 : 39.9;
    return {
      subtotal,
      discount,
      shipping,
      total: Math.max(subtotal - discount + shipping, 0),
      couponValid,
    };
  }

  function summaryCard({ checkout = false, coupon = false, submit = false, submitLabel = "Confirmar pedido" } = {}) {
    const total = totals();
    const rows = cartRows();
    return `
      <aside class="summary-card">
        <h2>Resumo do pedido</h2>
        ${rows
          .map(
            (item) => `
              <div class="summary-product">
                <span>${item.qty}x ${item.product.name}</span>
                <strong>${money(item.product.price * item.qty)}</strong>
              </div>
            `
          )
          .join("")}
        <div class="summary-line">
          <span>Subtotal</span>
          <strong>${money(total.subtotal)}</strong>
        </div>
        <div class="summary-line">
          <span>Frete</span>
          <strong>${total.shipping ? money(total.shipping) : "Grátis"}</strong>
        </div>
        <div class="summary-line">
          <span>Desconto</span>
          <strong>${total.discount ? `-${money(total.discount)}` : money(0)}</strong>
        </div>
        ${
          coupon
            ? `<div class="coupon-row">
                <input class="input" id="couponInput" type="text" placeholder="Cupom" value="${escapeAttr(state.coupon)}" />
                <button class="btn btn-dark" type="button" data-action="apply-coupon">Aplicar</button>
              </div>`
            : ""
        }
        <div class="summary-line summary-total">
          <span>Total</span>
          <strong>${money(total.total)}</strong>
        </div>
        ${checkout ? `<a class="btn btn-primary btn-full" href="${isLoggedIn() ? "#/checkout" : "#/conta?tab=login"}">${isLoggedIn() ? "Finalizar compra" : "Entrar para comprar"}</a>` : ""}
        ${submit ? `<button class="btn btn-primary btn-full" type="submit">${submitLabel}</button>` : ""}
        ${coupon ? `<p class="muted">Cupom de demonstração: COMMERCE10.</p>` : ""}
      </aside>
    `;
  }

  function applyCoupon() {
    const input = document.getElementById("couponInput");
    state.coupon = input?.value.trim() || "";
    localStorage.setItem(STORAGE.coupon, state.coupon);
    const total = totals();
    toast(total.couponValid ? "Cupom aplicado com sucesso." : "Cupom não encontrado.");
  }

  function emptyCart(title = "Seu carrinho está vazio", copy = "Escolha um produto para começar a compra.") {
    return `
      <div class="empty-state glass-card">
        <div>
          <h2>${title}</h2>
          <p>${copy}</p>
          <a class="btn btn-primary" href="#/categoria/todos">Ver produtos</a>
        </div>
      </div>
    `;
  }

  async function submitCheckout(form) {
    if (!isLoggedIn()) {
      toast("Entre na sua conta para finalizar a compra.");
      window.location.hash = "#/conta?tab=login";
      return;
    }

    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());
    const paymentMethod = data.payment || "pix";

    if (paymentMethod !== "pix") {
      toast(state.paymentBrickReady ? "Use o formulário seguro de cartão para concluir." : "Configure o Mercado Pago para liberar cartão.");
      return;
    }

    try {
      setPaymentResult(`<div class="payment-status-card"><strong>Gerando cobrança Pix...</strong><p>Aguarde enquanto conectamos ao Mercado Pago.</p></div>`);
      const response = await createPaymentRequest(form, { payment_method_id: "pix", payment_type_id: "bank_transfer" });
      finishCheckoutOrder(form, response, "pix");
    } catch (error) {
      setPaymentResult(`<div class="payment-status-card danger"><strong>Pagamento não iniciado</strong><p>${escapeHTML(error.message || "Não foi possível conectar ao backend de pagamento.")}</p></div>`);
      toast("Não foi possível iniciar o pagamento.");
    }
  }

  function finishCheckoutOrder(form, paymentResponse = {}, fallbackPayment = "pix") {
    const data = Object.fromEntries(new FormData(form).entries());
    const rows = cartRows();
    const total = totals();
    const method = paymentResponse.paymentType || data.payment || fallbackPayment;
    const isPix = method === "pix" || paymentResponse.pix;
    const order = {
      id: paymentResponse.orderId || `CMS-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString(),
      customer: {
        name: data.name,
        email: data.email,
        phone: data.phone,
      },
      address: {
        zip: data.zip,
        city: data.city,
        street: data.street,
        number: data.number,
        complement: data.complement,
      },
      payment: method,
      status: paymentResponse.statusLabel || (isPix ? "Aguardando pagamento Pix" : "Pagamento enviado"),
      paymentId: paymentResponse.paymentId || "",
      items: rows.map((item) => ({
        id: item.id,
        name: item.product.name,
        qty: item.qty,
        color: item.color,
        storage: item.storage,
        price: item.product.price,
      })),
      totals: total,
    };

    state.orders.unshift(order);
    saveJSON(STORAGE.orders, state.orders);

    state.user = {
      ...(state.user || {}),
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: order.address,
    };
    saveJSON(STORAGE.user, state.user);

    state.cart = [];
    state.coupon = "";
    saveJSON(STORAGE.cart, state.cart);
    localStorage.removeItem(STORAGE.coupon);
    updateCartCount();
    toast(`Pedido ${order.id} criado com sucesso.`);

    if (paymentResponse.pix) {
      setPaymentResult(pixResult(paymentResponse, order));
      return;
    }

    setPaymentResult(paymentStatusResult(paymentResponse, order));
  }

  async function initializeCheckoutPayments() {
    const notice = document.getElementById("paymentSetupNotice");
    if (!notice) return;

    refreshPaymentPanel();

    try {
      state.paymentConfig = await apiGet("/api/config");
    } catch {
      notice.innerHTML = `
        <strong>Backend de pagamento offline.</strong>
        <p>Para pagamentos reais, rode o servidor com <code>node server.js</code> e abra a loja pelo endereço local.</p>
      `;
      return;
    }

    if (!state.paymentConfig?.mercadoPago?.configured) {
      notice.innerHTML = `
        <strong>Mercado Pago ainda não configurado.</strong>
        <p>Preencha <code>MERCADO_PAGO_PUBLIC_KEY</code> e <code>MERCADO_PAGO_ACCESS_TOKEN</code> no arquivo <code>.env</code>.</p>
      `;
      return;
    }

    notice.innerHTML = `
      <strong>Mercado Pago conectado.</strong>
      <p>Pix é gerado pelo botão do resumo. Para crédito ou débito, use o formulário seguro abaixo.</p>
    `;

    if (window.MercadoPago && document.getElementById("cardPaymentBrick_container")) {
      await renderCardPaymentBrick();
    }
  }

  async function renderCardPaymentBrick() {
    if (state.paymentBrickController?.unmount) {
      state.paymentBrickController.unmount();
    }

    const total = totals().total;
    const mp = new window.MercadoPago(state.paymentConfig.mercadoPago.publicKey, { locale: "pt-BR" });
    const bricksBuilder = mp.bricks();

    state.paymentBrickController = await bricksBuilder.create("cardPayment", "cardPaymentBrick_container", {
      initialization: {
        amount: Number(total.toFixed(2)),
      },
      customization: {
        visual: {
          style: {
            theme: state.theme === "dark" ? "dark" : "default",
          },
        },
        paymentMethods: {
          maxInstallments: 12,
        },
      },
      callbacks: {
        onReady: () => {
          state.paymentBrickReady = true;
          refreshPaymentPanel();
        },
        onSubmit: (cardFormData) =>
          new Promise(async (resolve, reject) => {
            const form = app.querySelector('form[data-form="checkout"]');
            if (!form || !form.reportValidity()) {
              reject();
              return;
            }

            try {
              setPaymentResult(`<div class="payment-status-card"><strong>Processando cartão...</strong><p>Estamos enviando a transação para o Mercado Pago.</p></div>`);
              const response = await createPaymentRequest(form, cardFormData);
              finishCheckoutOrder(form, response, cardFormData.payment_type_id || "card");
              resolve();
            } catch (error) {
              setPaymentResult(`<div class="payment-status-card danger"><strong>Cartão não processado</strong><p>${escapeHTML(error.message || "Revise os dados do cartão e tente novamente.")}</p></div>`);
              reject();
            }
          }),
        onError: (error) => {
          setPaymentResult(`<div class="payment-status-card danger"><strong>Erro no formulário de cartão</strong><p>${escapeHTML(error?.message || "Não foi possível carregar o formulário seguro.")}</p></div>`);
        },
      },
    });
  }

  function destroyPaymentBrick() {
    if (state.paymentBrickController?.unmount) {
      state.paymentBrickController.unmount();
    }
    state.paymentBrickController = null;
    state.paymentBrickReady = false;
  }

  function refreshPaymentPanel() {
    const selected = app.querySelector('input[name="payment"]:checked')?.value || "pix";
    const brick = document.getElementById("cardPaymentBrick_container");
    const result = document.getElementById("paymentResult");
    if (brick) brick.hidden = selected === "pix";
    if (result && selected !== "pix" && !state.paymentBrickReady) {
      result.innerHTML = "";
    }
  }

  async function createPaymentRequest(form, paymentData = {}) {
    const payload = checkoutPayload(form, paymentData);
    const response = await apiPost("/api/payments/mercadopago", payload);
    if (!response.ok) {
      throw new Error(response.error || "Pagamento recusado pelo servidor.");
    }
    return response;
  }

  function checkoutPayload(form, paymentData = {}) {
    const data = Object.fromEntries(new FormData(form).entries());
    return {
      customer: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        document: data.document,
      },
      address: {
        zip: data.zip,
        city: data.city,
        street: data.street,
        number: data.number,
        complement: data.complement,
      },
      paymentMethod: data.payment || paymentData.payment_type_id || "pix",
      paymentData,
      coupon: state.coupon,
      cart: state.cart.map((item) => ({
        id: item.id,
        qty: item.qty,
        color: item.color,
        storage: item.storage,
      })),
    };
  }

  function setPaymentResult(html) {
    const result = document.getElementById("paymentResult");
    if (result) result.innerHTML = html;
  }

  function pixResult(response, order) {
    const pix = response.pix || {};
    return `
      <div class="payment-status-card success">
        <strong>Pedido ${order.id} aguardando Pix</strong>
        <p>Escaneie o QR Code ou copie o código abaixo para pagar no aplicativo do banco.</p>
        ${pix.qrCodeBase64 ? `<img class="pix-qr" src="data:image/png;base64,${escapeAttr(pix.qrCodeBase64)}" alt="QR Code Pix" />` : ""}
        ${pix.qrCode ? `<textarea class="textarea pix-copy" readonly>${pix.qrCode}</textarea>` : ""}
        ${pix.ticketUrl ? `<a class="btn btn-light" target="_blank" rel="noopener" href="${escapeAttr(pix.ticketUrl)}">Abrir instruções do Pix</a>` : ""}
        <a class="btn btn-primary" href="#/conta?tab=pedidos">Ver pedido</a>
      </div>
    `;
  }

  function paymentStatusResult(response, order) {
    return `
      <div class="payment-status-card ${response.approved ? "success" : ""}">
        <strong>Pedido ${order.id}</strong>
        <p>Status Mercado Pago: ${escapeHTML(response.status || "em processamento")} ${response.statusDetail ? `(${escapeHTML(response.statusDetail)})` : ""}</p>
        <a class="btn btn-primary" href="#/conta?tab=pedidos">Ver pedido</a>
      </div>
    `;
  }

  function accountContent(tab) {
    if (tab === "cadastro") {
      return `
        <form data-form="register">
          <div class="form-grid">
            ${field("Nome completo", "name", "text", state.user?.name || "", true, "span-2")}
            ${field("E-mail", "email", "email", state.user?.email || "", true)}
            ${field("Telefone", "phone", "tel", state.user?.phone || "", true)}
            ${field("Senha", "password", "password", "", true)}
            ${field("Confirmar senha", "confirm", "password", "", true)}
          </div>
          <div class="hero-actions">
            <button class="btn btn-primary" type="submit">Criar conta</button>
          </div>
        </form>
      `;
    }

    if (tab === "pedidos") {
      return `
        <div class="order-list">
          ${
            state.orders.length
              ? state.orders.map(orderCard).join("")
              : `<div class="empty-state glass-card"><div><h2>Nenhum pedido ainda</h2><p>Seus pedidos simulados aparecem aqui após o checkout.</p></div></div>`
          }
        </div>
      `;
    }

    if (tab === "dados") {
      return `
        <form data-form="profile">
          <div class="form-grid">
            ${field("Nome completo", "name", "text", state.user?.name || "", true, "span-2")}
            ${field("E-mail", "email", "email", state.user?.email || "", true)}
            ${field("Telefone", "phone", "tel", state.user?.phone || "", true)}
          </div>
          <div class="hero-actions">
            <button class="btn btn-primary" type="submit">Salvar dados</button>
          </div>
        </form>
      `;
    }

    if (tab === "enderecos") {
      return `
        <form data-form="address">
          <div class="form-grid">
            ${field("CEP", "zip", "text", state.user?.address?.zip || "", true)}
            ${field("Cidade", "city", "text", state.user?.address?.city || "", true)}
            ${field("Rua", "street", "text", state.user?.address?.street || "", true, "span-2")}
            ${field("Número", "number", "text", state.user?.address?.number || "", true)}
            ${field("Complemento", "complement", "text", state.user?.address?.complement || "", false)}
          </div>
          <div class="hero-actions">
            <button class="btn btn-primary" type="submit">Salvar endereço</button>
          </div>
        </form>
      `;
    }

    return `
      <form data-form="login">
        <div class="form-grid">
          ${field("E-mail", "email", "email", state.user?.email || "", true, "span-2")}
          ${field("Senha", "password", "password", "", true, "span-2")}
        </div>
        <div class="hero-actions">
          <button class="btn btn-primary" type="submit">Entrar</button>
          <button class="btn btn-light" type="button" data-action="account-tab" data-tab="cadastro">Criar cadastro</button>
        </div>
      </form>
    `;
  }

  async function submitLogin(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const fallbackUser = {
      ...(state.user || {}),
      name: state.user?.name || data.email.split("@")[0] || "Cliente Demo",
      email: data.email,
      phone: state.user?.phone || "",
    };

    try {
      const response = await apiPost("/api/auth/login", {
        email: data.email,
        password: data.password,
        name: fallbackUser.name,
        phone: fallbackUser.phone,
      });
      state.user = response.user || fallbackUser;
    } catch {
      state.user = fallbackUser;
      toast("Login local ativo. Rode o servidor para habilitar pagamento real.");
    }

    saveJSON(STORAGE.user, state.user);
    toast("Login simulado realizado.");
    renderAccountPage("pedidos");
  }

  async function submitRegister(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.password !== data.confirm) {
      toast("As senhas não conferem.");
      return;
    }
    const fallbackUser = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: state.user?.address || {},
    };

    try {
      const response = await apiPost("/api/auth/register", {
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
      });
      state.user = response.user || fallbackUser;
    } catch {
      state.user = fallbackUser;
      toast("Cadastro local ativo. Rode o servidor para habilitar pagamento real.");
    }

    saveJSON(STORAGE.user, state.user);
    toast("Cadastro criado com sucesso.");
    renderAccountPage("dados");
  }

  function submitProfile(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    state.user = {
      ...(state.user || {}),
      name: data.name,
      email: data.email,
      phone: data.phone,
    };
    saveJSON(STORAGE.user, state.user);
    toast("Dados pessoais salvos.");
    renderAccountPage("dados");
  }

  function submitAddress(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    state.user = {
      ...(state.user || { name: "Cliente Demo", email: "", phone: "" }),
      address: data,
    };
    saveJSON(STORAGE.user, state.user);
    toast("Endereço salvo.");
    renderAccountPage("enderecos");
  }

  function orderCard(order) {
    return `
      <article class="order-card">
        <header>
          <div>
            <strong>${order.id}</strong>
            <p class="muted">${formatDate(order.date)} · ${order.items.length} item${order.items.length === 1 ? "" : "s"}</p>
          </div>
          <span class="status-pill">${order.status}</span>
        </header>
        <p>${order.items.map((item) => `${item.qty}x ${item.name}`).join(", ")}</p>
        <strong>${money(order.totals.total)}</strong>
      </article>
    `;
  }

  // CRUD administrativo de produtos, persistido localmente para a demonstração.
  function submitAdminProduct(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const existing = data.id ? findProduct(data.id) : null;
    const price = Number(data.price);
    const oldPrice = Number(data.oldPrice) || price;
    const discount = Number(data.discount) || (oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0);
    const id = existing?.id || uniqueProductId(slugify(data.name));

    const product = {
      id,
      name: data.name,
      category: data.category,
      brand: data.brand,
      model: data.model,
      price,
      oldPrice,
      discount,
      installments: existing?.installments || 12,
      rating: Number(data.rating) || 4.7,
      reviews: existing?.reviews || 0,
      stock: Number(data.stock) || 0,
      sold: existing?.sold || 0,
      featured: Boolean(data.featured),
      launch: Boolean(data.launch),
      colors: splitList(data.colors),
      storages: splitList(data.storages),
      tags: existing?.tags || [data.category, data.brand, data.model],
      visual: existing?.visual || visualForCategory(data.category),
      description: data.description,
      specs: splitLines(data.specs).length ? splitLines(data.specs) : ["Produto cadastrado no painel administrativo."],
    };

    if (existing) {
      state.products = state.products.map((item) => (item.id === existing.id ? product : item));
    } else {
      state.products.unshift(product);
    }

    saveJSON(STORAGE.products, state.products);
    state.editingProductId = "";
    toast(existing ? "Produto atualizado." : "Produto adicionado.");
    renderAdminPage();
  }

  function deleteProduct(productId) {
    const product = findProduct(productId);
    if (!product) return;
    const shouldDelete = window.confirm(`Excluir ${product.name}?`);
    if (!shouldDelete) return;

    state.products = state.products.filter((item) => item.id !== productId);
    state.cart = state.cart.filter((item) => item.id !== productId);
    saveJSON(STORAGE.products, state.products);
    saveJSON(STORAGE.cart, state.cart);
    toast("Produto excluído.");
    renderAdminPage();
  }

  function adjustStock(productId, delta) {
    const product = findProduct(productId);
    if (!product || !delta) return;

    product.stock = Math.max(0, Number(product.stock || 0) + delta);
    saveJSON(STORAGE.products, state.products);
    toast(`Estoque de ${product.name} atualizado para ${product.stock}.`);

    const route = parseRoute();
    if (route.name === "estoque") {
      renderInventoryPage();
    } else {
      renderAdminPage();
    }
  }

  function resetProducts() {
    const shouldReset = window.confirm("Restaurar os produtos mockados originais?");
    if (!shouldReset) return;
    localStorage.removeItem(STORAGE.products);
    state.products = clone(window.COMMERCE_PRODUCTS);
    state.editingProductId = "";
    toast("Mock de produtos restaurado.");
    parseRoute().name === "estoque" ? renderInventoryPage() : renderAdminPage();
  }

  function submitCategory(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const id = uniqueCategoryId(slugify(data.name));
    const custom = loadJSON(STORAGE.categories, []);
    custom.push({
      id,
      name: data.name,
      label: "Categoria personalizada",
      icon: "plus",
      featured: false,
      custom: true,
    });
    saveJSON(STORAGE.categories, custom);
    state.categories = loadCategories();
    toast("Categoria adicionada.");
    renderAdminPage();
  }

  function deleteCategory(categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (!category?.custom) return;
    const custom = loadJSON(STORAGE.categories, []).filter((item) => item.id !== categoryId);
    saveJSON(STORAGE.categories, custom);
    state.categories = loadCategories();
    toast("Categoria removida.");
    renderAdminPage();
  }

  function productTableRow(product) {
    const status = stockStatus(product);
    return `
      <tr>
        <td><strong>${product.name}</strong><br /><span class="muted">${product.model}</span></td>
        <td>${categoryName(product.category)}</td>
        <td>${money(product.price)}</td>
        <td><span class="status-pill ${status.className}">${product.stock} · ${status.label}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-light btn-sm" type="button" data-action="edit-product" data-product-id="${product.id}">Editar</button>
            <button class="btn btn-light btn-sm danger" type="button" data-action="delete-product" data-product-id="${product.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }

  function inventoryTableRow(product) {
    const status = stockStatus(product);
    return `
      <tr>
        <td><strong>${product.name}</strong><br /><span class="muted">${product.model}</span></td>
        <td>${categoryName(product.category)}</td>
        <td><span class="status-pill ${status.className}">${status.label}</span></td>
        <td><strong>${product.stock}</strong></td>
        <td>${money(product.stock * product.price)}</td>
        <td>
          <div class="table-actions stock-actions">
            <button class="round-action small" type="button" data-action="stock-adjust" data-product-id="${product.id}" data-delta="-1" aria-label="Reduzir estoque de ${product.name}">${icon("minus")}</button>
            <button class="round-action small" type="button" data-action="stock-adjust" data-product-id="${product.id}" data-delta="1" aria-label="Aumentar estoque de ${product.name}">${icon("plus")}</button>
          </div>
        </td>
      </tr>
    `;
  }

  function restockItem(product) {
    const status = stockStatus(product);
    return `
      <article class="restock-item">
        <div class="restock-media">${productVisual(product)}</div>
        <div>
          <strong>${product.name}</strong>
          <p>${categoryName(product.category)} · ${product.stock} unidades</p>
          <span class="status-pill ${status.className}">${status.label}</span>
        </div>
        <div class="stock-actions">
          <button class="round-action small" type="button" data-action="stock-adjust" data-product-id="${product.id}" data-delta="1" aria-label="Aumentar estoque de ${product.name}">${icon("plus")}</button>
        </div>
      </article>
    `;
  }

  function categoryAdminRow(category) {
    return `
      <article class="order-card">
        <header>
          <div>
            <strong>${category.name}</strong>
            <p class="muted">${category.id}</p>
          </div>
          ${
            category.custom
              ? `<button class="remove-btn" type="button" data-action="delete-category" data-category-id="${category.id}">Remover</button>`
              : `<span class="status-pill">Base</span>`
          }
        </header>
      </article>
    `;
  }

  function orderTableRow(order) {
    return `
      <tr>
        <td><strong>${order.id}</strong><br /><span class="muted">${formatDate(order.date)}</span></td>
        <td>${order.customer.name}<br /><span class="muted">${order.customer.email}</span></td>
        <td>${money(order.totals.total)}</td>
        <td>
          <select class="select" data-order-status data-order-id="${order.id}">
            ${["Pedido recebido", "Pagamento aprovado", "Em separação", "Enviado", "Entregue", "Cancelado"]
              .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
              .join("")}
          </select>
        </td>
      </tr>
    `;
  }

  function adminTotals() {
    const revenue = state.orders.reduce((sum, order) => sum + Number(order.totals.total || 0), 0);
    return {
      revenue,
      orders: state.orders.length,
      lowStock: state.products.filter((product) => product.stock <= 20).length,
    };
  }

  function inventoryTotals() {
    return state.products.reduce(
      (totals, product) => {
        totals.units += Number(product.stock || 0);
        totals.value += Number(product.stock || 0) * Number(product.price || 0);
        if (Number(product.stock || 0) <= 10) totals.critical += 1;
        return totals;
      },
      { units: 0, value: 0, critical: 0 }
    );
  }

  function totalStock() {
    return inventoryTotals().units;
  }

  function stockStatus(product) {
    const stock = Number(product.stock || 0);
    if (stock <= 0) return { label: "Indisponível", className: "stock-out" };
    if (stock <= 10) return { label: "Reposição", className: "stock-critical" };
    if (stock <= 20) return { label: "Estoque baixo", className: "stock-low" };
    return { label: "Em estoque", className: "stock-ok" };
  }

  function statCard(label, value) {
    return `
      <article class="stat-card glass-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </article>
    `;
  }

  function field(label, name, type, value = "", required = false, extraClass = "") {
    return `
      <label class="field ${extraClass}">
        <span>${label}</span>
        <input class="input" name="${name}" type="${type}" value="${escapeAttr(value)}" ${required ? "required" : ""} ${type === "number" ? "step=\"0.01\"" : ""} />
      </label>
    `;
  }

  function paymentOption(title, copy, value, checkedOption) {
    return `
      <label class="payment-option">
        <input type="radio" name="payment" value="${value}" ${checkedOption ? "checked" : ""} />
        <strong>${title}</strong>
        <span>${copy}</span>
      </label>
    `;
  }

  function renderNotFound(title, copy) {
    app.innerHTML = `
      <div class="page">
        <div class="empty-state glass-card">
          <div>
            <h1>${title}</h1>
            <p>${copy}</p>
            <a class="btn btn-primary" href="#/categoria/todos">Voltar aos produtos</a>
          </div>
        </div>
      </div>
    `;
  }

  function defaultFilters(category = "todos", search = "") {
    return {
      category,
      search,
      min: "",
      max: "",
      models: [],
      colors: [],
      storages: [],
      brands: [],
      rating: "",
      sort: "relevance",
    };
  }

  function catalogTitle() {
    if (state.filters.search) return `Busca por "${state.filters.search}"`;
    if (state.filters.category === "todos") return "Todos os produtos";
    if (state.filters.category === "ofertas") return "Promoções";
    return categoryName(state.filters.category);
  }

  function categoryName(categoryId) {
    return state.categories.find((category) => category.id === categoryId)?.name || "Acessórios";
  }

  function findProduct(productId) {
    return state.products.find((product) => product.id === productId);
  }

  function updateCartCount(bump = false) {
    const total = state.cart.reduce((sum, item) => sum + item.qty, 0);
    cartCount.textContent = total;

    if (bump && cartLink) {
      cartLink.classList.remove("bump");
      void cartLink.offsetWidth;
      cartLink.classList.add("bump");
    }
  }

  function currentTheme() {
    const saved = localStorage.getItem(STORAGE.theme);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle?.setAttribute("aria-pressed", String(theme === "dark"));
    themeToggle?.setAttribute("title", theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro");
  }

  function closeMobileMenu() {
    mobilePanel.classList.remove("open");
    mobileToggle.setAttribute("aria-expanded", "false");
  }

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    toastStack.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function icon(name) {
    const icons = {
      arrow: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7m0 0H9m8 0v8" /></svg>',
      truck: '<svg viewBox="0 0 24 24"><path d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7v-7ZM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>',
      shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3Z" /></svg>',
      lock: '<svg viewBox="0 0 24 24"><path d="M6 10h12v10H6V10Zm3 0V7a3 3 0 0 1 6 0v3" /></svg>',
      headset: '<svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0 1 16 0v4a3 3 0 0 1-3 3h-2m-7-3H6a2 2 0 0 1-2-2v-2h4v4Zm12 0h-4v-4h4v4Z" /></svg>',
      shoppingBag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 13H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2" /></svg>',
      boxes: '<svg viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" /><path d="M4 7.5v9L12 21l8-4.5v-9M12 12v9" /></svg>',
      chevronLeft: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>',
      chevronRight: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>',
      settings: '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 0 1-4 0v-.09a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.08H3a2 2 0 0 1 0-4h.09A1.8 1.8 0 0 0 4.74 8.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.27 2.7V2a2 2 0 0 1 4 0v.09a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.08H21a2 2 0 0 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z" /></svg>',
      refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-4M4 5v5h5m-5 3a8 8 0 0 0 14.9 4M20 19v-5h-5" /></svg>',
      minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>',
      plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>',
      user: '<svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>',
      productPhone: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>',
      productEarbuds: '<svg viewBox="0 0 24 24"><path d="M7 4a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h1V7a3 3 0 0 0-1-3Z" /><path d="M17 4a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1V7a3 3 0 0 1 1-3Z" /><path d="M8 12v7M16 12v7" /></svg>',
      productCharger: '<svg viewBox="0 0 24 24"><path d="M8 2v5M16 2v5M7 7h10v5a5 5 0 0 1-10 0V7Z" /><path d="M12 17v5" /></svg>',
      productCable: '<svg viewBox="0 0 24 24"><path d="M6 8h5v8H6a4 4 0 0 1 0-8Z" /><path d="M18 7v10M14 9h4M14 15h4M11 12h3" /></svg>',
      productCase: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="3" /><circle cx="10.5" cy="7.5" r="1.2" /></svg>',
      productGlass: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="3" /><path d="m9 8 3-3 3 3M9 16l3 3 3-3" /></svg>',
      productWatch: '<svg viewBox="0 0 24 24"><path d="M9 2h6l1 4H8l1-4ZM8 18h8l-1 4H9l-1-4Z" /><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M10 12h4" /></svg>',
      productTablet: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M12 18h.01" /></svg>',
      productMount: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M12 12v4M8 20h8M9 16h6" /></svg>',
      productBattery: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="3" /><path d="M10 2h4M9 15h6M12 8v4" /></svg>',
    };
    return icons[name] || icons.arrow;
  }

  function stars() {
    return "★";
  }

  function money(value) {
    return formatter.format(Number(value) || 0);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }

  function checked(list, value) {
    return list.includes(value) ? "checked" : "";
  }

  function escapeAttr(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHTML(value) {
    return escapeAttr(value).replace(/'/g, "&#039;");
  }

  function colorToCss(label) {
    const text = normalize(label);
    if (text.includes("preto") || text.includes("meia-noite") || text.includes("grafite")) return "#202124";
    if (text.includes("azul")) return "#77a8d8";
    if (text.includes("verde")) return "#9ccc9a";
    if (text.includes("rosa")) return "#f3a8bb";
    if (text.includes("amarelo")) return "#f4d26a";
    if (text.includes("roxo")) return "#a391d7";
    if (text.includes("branco") || text.includes("estelar")) return "#f1f1ed";
    if (text.includes("prata")) return "#d8d8dc";
    if (text.includes("titanio")) return "#b7afa6";
    if (text.includes("transparente") || text.includes("cristal")) return "rgba(255,255,255,.72)";
    return "#d8d8dc";
  }

  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : clone(fallback);
    } catch {
      return clone(fallback);
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isLoggedIn() {
    return Boolean(state.user?.email);
  }

  async function apiGet(path) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erro de comunicação com o servidor.");
    return data;
  }

  async function apiPost(path, body) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erro de comunicação com o servidor.");
    return data;
  }

  async function hydrateServerSession() {
    try {
      const session = await apiGet("/api/session");
      if (session.authenticated && session.user) {
        state.user = {
          ...(state.user || {}),
          ...session.user,
        };
        saveJSON(STORAGE.user, state.user);
      }
    } catch {
      // A loja continua abrindo como SPA estática; o backend só é obrigatório para pagamentos reais.
    }
  }

  function loadSavedProducts() {
    const saved = loadJSON(STORAGE.products, null);
    return Array.isArray(saved) && saved.length ? saved : clone(window.COMMERCE_PRODUCTS);
  }

  function loadCategories() {
    const custom = loadJSON(STORAGE.categories, []);
    const byId = new Map(clone(window.COMMERCE_CATEGORIES).map((category) => [category.id, category]));
    custom.forEach((category) => byId.set(category.id, category));
    return [...byId.values()];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function splitList(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function splitLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function slugify(value) {
    return normalize(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function uniqueProductId(base) {
    let candidate = base || "produto";
    let index = 2;
    while (state.products.some((product) => product.id === candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function uniqueCategoryId(base) {
    let candidate = base || "categoria";
    let index = 2;
    while (state.categories.some((category) => category.id === candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function visualForCategory(category) {
    const visualMap = {
      iphones: { type: "phone", tone: "midnight" },
      capinhas: { type: "case", tone: "clear" },
      carregadores: { type: "charger", tone: "white" },
      audio: { type: "buds", tone: "white" },
      peliculas: { type: "glass", tone: "clear" },
      watch: { type: "watch", tone: "midnight" },
      ipad: { type: "tablet", tone: "purple" },
      acessorios: { type: "battery", tone: "white" },
    };
    return visualMap[category] || { type: "case", tone: "clear" };
  }

  function seedOrders() {
    return [
      {
        id: "CMS-1024",
        date: "2026-05-02T13:30:00.000Z",
        customer: {
          name: "Cliente Demonstração",
          email: "cliente@commerce.demo",
          phone: "(11) 90000-0000",
        },
        address: {
          city: "São Paulo",
          street: "Av. Tecnologia",
          number: "100",
        },
        payment: "pix",
        status: "Pagamento aprovado",
        items: [
          {
            id: "iphone-15",
            name: "iPhone 15",
            qty: 1,
            color: "Azul",
            storage: "128 GB",
            price: 5299.9,
          },
          {
            id: "capinha-transparente",
            name: "Capinha Transparente",
            qty: 1,
            color: "Transparente",
            storage: "iPhone 15",
            price: 129.9,
          },
        ],
        totals: {
          subtotal: 5429.8,
          discount: 0,
          shipping: 0,
          total: 5429.8,
        },
      },
    ];
  }

  init();
})();
