# Commerce Studio

E-commerce demonstrativo white-label para venda de smartphones, acessórios e produtos de varejo, criado em HTML, CSS e JavaScript puro.

## Como rodar

Abra `index.html` no navegador.

O projeto é uma SPA estática com rotas por hash, então também funciona em qualquer servidor simples de arquivos.

Para habilitar login de servidor e pagamento via Mercado Pago:

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Preencha `MERCADO_PAGO_PUBLIC_KEY` e `MERCADO_PAGO_ACCESS_TOKEN` com credenciais de teste do Mercado Pago.
3. Rode `node server.js`.
4. Abra `http://localhost:3000/iprime-store/index.html`.

## Estrutura

- `index.html`: estrutura base, header fixo, alternador de tema, footer e ponto de montagem da aplicação.
- `assets/css/styles.css`: layout responsivo, modo claro/escuro, carrossel, vitrine, cards, artes dos produtos e estados mobile.
- `assets/js/products.js`: categorias e catálogo mockado ampliado.
- `assets/js/app.js`: rotas, busca, filtros, carrossel, vitrine, estoque, carrinho, checkout, área do cliente e painel administrativo.

## Funcionalidades

- Busca funcional por produto, marca, modelo e tags.
- Filtros por preço, modelo, cor, armazenamento, marca e avaliação.
- Ordenação por relevância, menor preço, maior preço, mais vendidos e lançamentos.
- Carrinho persistente com `localStorage`.
- Carrossel de produtos na home.
- Vitrine editorial com produto principal e produtos secundários.
- Modo claro e escuro persistente.
- Página dedicada de gerenciamento de estoque.
- Checkout com login obrigatório.
- Backend Node nativo para sessão, Pix e cartão via Mercado Pago.
- Cupom demonstrativo `COMMERCE10`.
- Checkout simulado com criação de pedido.
- Área do cliente com login, cadastro, pedidos, dados e endereços.
- Painel administrativo para adicionar, editar, excluir produtos, gerenciar categorias, estoque e status de pedidos.

## Observação

A loja é uma demonstração independente. Marcas e nomes de produtos citados pertencem aos seus respectivos titulares.
