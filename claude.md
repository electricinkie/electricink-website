# CLAUDE.md — electricink-ie

## O que é este projecto
Site público da Electric Ink IE: loja online, checkout com Stripe
(só como convidado) e integração com o sistema interno
(electricink-internal no Railway). O loyalty (Black Cat Rewards) e a
conta de cliente estão desativados: account.html só abre com ?reset=
(senão redireciona para /), loyalty.html redireciona sempre para /, e o
código continua no repo à espera de remoção.

## Regras de trabalho — NUNCA VIOLAR
- Ler SEMPRE o ficheiro completo antes de qualquer alteração
- Uma mudança cirúrgica por prompt — find → replace exacto
- Nunca misturar este repo com o electricink-internal no mesmo prompt
- Nunca inventar nomes de funções, variáveis ou endpoints
- Descrever o problema com evidência do código antes de propor fix
- Nunca rewrites de arquitectura — só fixes cirúrgicos
- Identificar falsos positivos antes de gerar prompts de audit

## Stack
- Vercel (frontend estático + serverless API routes)
- Frontend: Vanilla JS. Os ficheiros com import/export são ES modules (ex. js/checkout.js importa de ./constants.js); muitos outros em js/ são scripts clássicos sem import/export (ex. account.js, cart-drawer.js, desktop-header.js, mobile-header.js, category-page.js, homepage-prices.js)
- API routes: CommonJS (require/module.exports) — NÃO misturar
- Stripe: PaymentIntent + webhooks + Payment Request Button
- Firebase/Firestore: NÃO é usado por nenhuma rota em api/*.js (nem para
  orders — a idempotência das orders é garantida pelo internal via
  ON CONFLICT (order_id)). Resta apenas resíduo: check de env
  FIREBASE_SERVICE_ACCOUNT em api/create-payment-intent.js e
  scripts/dev-server.js, que faz require de api/lib/firebase-admin
  (ficheiro que já não existe)
- Rate limiting: os 4 pontos (api/catalog.js, api/validate-coupon.js,
  api/convention-apply.js, api/create-payment-intent.js) usam new Map()
  em memória, por instância serverless — ineficaz entre cold starts,
  conhecido e documentado como tal
- Abandoned carts: vivem na PostgreSQL do electricink-internal (tabela
  abandoned_carts, restore_token + expiração), consumidos via
  api/abandoned-cart-save.js e api/abandoned-cart-convert.js neste repo
- Resend: o SDK usa-se diretamente em api/webhooks-stripe.js e api/ship-notify.js (api/lib/resend.js existe mas não é importado e está excluído do deploy). O SDK devolve { data, error } sem lançar exceção quando a API recusa o envio, e este código ainda não lê `error` (ver Divergências conhecidas)
- Logger: api/lib/** é excluído do deploy pelo .vercelignore (limite de
  funções serverless do plano Vercel) — cada rota em api/*.js define o
  seu próprio logger inline (padrão: const logger = { info: console.log,
  ... }). NUNCA fazer require('./lib/...') de dentro de api/ — causa
  MODULE_NOT_FOUND em produção (incidente de 2026-09, ver historial).
  Qualquer código partilhado entre funções serverless deve viver em /lib
  na raiz do repositório, fora de /api.
  Exceções conhecidas: api/catalog.js e api/config.js usam console.error
  diretamente. O Sentry está em stub (captureException só faz
  console.error) em api/create-payment-intent.js e api/webhooks-stripe.js.
  api/lib/sentry.js e api/lib/logger.js existem mas ninguém os importa.

## Ficheiros críticos
- api/webhooks-stripe.js — a idempotência é do internal (ON CONFLICT (order_id); resposta duplicate: true). Este ficheiro não usa Firestore
- api/create-payment-intent.js — preços server-side + buildItemsMeta
- api/validate-coupon.js — validação de cupons Stripe
- api/catalog.js — proxy para o internal que remove o custo do fornecedor e acrescenta promo_active e effective_price_ex (usa ../lib/promo)
- api/lib/constants.js — NÃO USADO (código morto): não é importado por
  nenhum ficheiro, é excluído do deploy pelo .vercelignore, e não contém
  catálogo (só SHIPPING_METHODS, FREE_SHIPPING_THRESHOLD, PRODUCT_FIELDS).
  Não confundir com js/constants.js, que é o usado pelo frontend
- js/checkout.js — fluxo completo + Express Checkout
- js/account.js — auth, loyalty, dashboard (INATIVO: account.html redireciona para /; remoção planeada)
- js/cart-drawer.js — sem import/export, funciona com e sem type="module" (account, cart, checkout, conventions e witches-brew-photos usam type="module"; as outras páginas não). Não é obrigatório
- js/homepage-prices.js — preços dinâmicos via /api/catalog
- vercel.json — functions (maxDuration 30), headers (CSP) e cleanUrls; não tem rewrites
- js/product-page.js — página de produto (catálogo, reviews, waitlist)
- js/category-page.js — listagem via /api/catalog?type=products
- js/success.js — chama /api/abandoned-cart-convert
- js/constants.js — INTERNAL_API_URL e FREE_SHIPPING_THRESHOLD (usado pelo frontend)
- api/ship-notify.js — email de envio (Resend); não há chamadas conhecidas a partir do internal

## Padrões obrigatórios

### Preços
- Preços: o internal devolve preços ex-IVA e o site calcula o gross (× 1.23) em api/create-payment-intent.js; o fallback local data/*.json traz o gross. IVA fixo de 23%
- price_ex para o internal: gross / 1.23
- NUNCA enviar gross como price_ex
- buildItemsMeta(): guard de 490 chars para metadata Stripe

### Webhook
- Idempotente via internal: se /api/sales/website responder duplicate: true, os emails não são enviados
- Só devolve 200 ao Stripe depois de processar tudo (POST ao internal com timeout de 25 s e os dois emails; maxDuration 30 s). Um erro no POST ao internal ou num email NÃO faz o Stripe reenviar, porque é apanhado dentro do handler e o 200 sai na mesma. O handler devolve 400 se a assinatura ou os metadados forem inválidos e 500 para outros erros não tratados (api/webhooks-stripe.js, por volta das linhas 276, 291 e 343)
- Logger sempre — nunca console.log nas API routes
- POST para internal /api/sales/website é best-effort

### Express Checkout
- ev.complete('success') ANTES de qualquer redirect
- stripe.confirmCardPayment com handleActions: false

### Frontend
- Os ficheiros com import/export são ES modules; os restantes são scripts clássicos (ver Stack)
- Nunca hardcode de chaves secretas (a chave publishable do Stripe, pk_live_, está em checkout.html e é pública por natureza)
- cart-drawer.js: não tem import/export; funciona com ou sem type="module"

## Auth flow (INATIVO: account.html redireciona para /)
- JWT em localStorage (TOKEN_KEY = 'ei_loyalty_token')
- Tab default: Sign in
- ?tab=register → abre registo
- JWT expirado → signout automático + toast
- Email verification: NÃO implementado ainda

## Fluxos críticos — testar após qualquer mudança
1. Carrinho → checkout → pagamento Stripe
2. Google Pay / Apple Pay → ev.complete → success page
3. Cupom → aplicado correctamente no total
4. (inativo) Login → dashboard → Catokens visíveis
5. (inativo) Registo com referral. A UI do site mostra +250 Catokens; valores a rever
6. (inativo) Redeem → cupom Stripe gerado no internal
7. Webhook → idempotente (segunda chamada não duplica)
8. Free shipping threshold → visível no carrinho

## Endpoints do internal que o site consome
- POST /api/sales/website — x-webhook-secret
- GET /api/loyalty/rank-discount — NÃO é consumido (chamada comentada em api/create-payment-intent.js)
- GET /api/loyalty/points-summary?email= — só server-side, em api/webhooks-stripe.js (x-crm-secret), em cada encomenda; alimenta o bloco de pontos do email de confirmação
- GET /api/reviews — público
- POST /api/reviews — público
- GET /api/products/:id — x-crm-secret (via api/catalog.js)
- POST /api/abandoned-cart-save — bridge local, anexa x-webhook-secret
  server-side antes de reencaminhar para o internal
- POST /api/abandoned-cart-convert — idem
- GET /api/abandoned-cart/restore — directo ao internal, autenticado por
  token na própria URL, não por header
- GET /api/products — x-crm-secret (api/create-payment-intent.js, preços server-side; também api/catalog.js)
- GET /api/sales/website/has-orders?email= — x-webhook-secret (cupões first_order_only, em api/create-payment-intent.js e api/validate-coupon.js)
- PATCH /api/sales/refund/:pi — x-webhook-secret (api/webhooks-stripe.js)
- GET /api/sales/:id — x-crm-secret (api/ship-notify.js)
- POST /api/conventions — x-webhook-secret (api/convention-apply.js)
- POST /api/waitlist/notify-me — público (js/product-page.js)
- /api/auth/* e /api/loyalty/* (badges, rewards, redeem, redemptions, my-orders, notifications) — js/account.js e os headers, INATIVOS; js/checkout.js também chama /api/auth/me quando existe ei_loyalty_token em localStorage

## Integration check — correr após mudanças de auth
- As páginas com carrinho carregam /js/cart-drawer.js (com ou sem type="module")
- Todos os fetches ao internal têm o header correcto?
- Preços no checkout batem com o catálogo?

## Historial de mudanças críticas
- 2026-03: CORS www.electricink.ie (fix Safari)
- 2026-03: Free shipping fix — 0 || x falsy bug
- 2026-03: cart-drawer.js type="module" obrigatório
- 2026-03: Tab default Sign in (não Join now)
- 2026-03: Debug ?debug=true removido
- 2026-03: PayPal/Klarna removidos dos ícones
- 2026-04: JWT expirado → signout + toast
- 2026-04: Indicador força de password
- 2026-04: homepage-prices.js — preços dinâmicos
- 2026-04: Admin email fix — resolveCatalogItem()
- 2026-04: cart-drawer.js type="module" em checkout + cart

### 2026-09
- Sistema de promoções: lib/promo.js (raiz do repo, fora de /api de
  propósito — ver nota sobre api/lib/** na secção Stack), api/catalog.js
  enriquece a resposta com promo_active/effective_price_ex, exibição nas
  3 páginas (home, categoria, produto), carrossel de descoberta na
  homepage entre o showcase do Ultra Pen e os Bestsellers
- api/abandoned-cart-save.js e api/abandoned-cart-convert.js criados —
  bridges que anexam x-webhook-secret server-side; js/checkout.js
  restore trocado de atob(email) para token aleatório na URL;
  api/webhooks-stripe.js: escape de customerPhone/item.name em falta
  corrigido
- Incidente de produção (2026-09): require('./lib/promo') dentro de
  api/catalog.js e api/create-payment-intent.js causou 500 em ambas as
  funções porque .vercelignore exclui api/lib/**. Revertido; lib/promo.js
  recriado fora de /api. Regra resultante: ver linha Logger na secção
  Stack.

## Divergências conhecidas (por corrigir, não são regras)
- Webhook: o SDK do Resend 3.5.0 devolve { data, error } e o código lê result.id em vez de data.id; um email recusado fica no log como enviado e o emailId sai undefined. Sem retry se o POST ao internal falhar (só fica um log)
- Express Checkout: no ramo requires_action, stripe.handleCardAction corre antes de ev.complete (js/checkout.js, por volta das linhas 699 e 704), ao contrário do comentário e da regra acima. A verificar na documentação do Stripe
- Código morto: api/lib/constants.js, logger.js, resend.js e sentry.js; scripts/dev-server.js faz require de api/lib/firebase-admin, que não existe; check residual de FIREBASE_SERVICE_ACCOUNT em api/create-payment-intent.js
- js/cart-drawer.js tem o limiar de portes grátis (150) escrito à mão em vez de FREE_SHIPPING_THRESHOLD
- js/checkout.js: comentário obsoleto sobre ?debug=true
- checkout: envia ei_loyalty_token como customerToken e o rank discount está comentado em api/create-payment-intent.js