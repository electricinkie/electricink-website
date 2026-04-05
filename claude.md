# CLAUDE.md — electricink-ie

## O que é este projecto
Site público da Electric Ink IE: loja online, checkout com Stripe,
sistema de loyalty (Black Cat Rewards), conta de cliente, e integração
com o sistema interno (electricink-internal no Railway).

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
- Frontend: Vanilla JS com ES modules (import/export)
- API routes: CommonJS (require/module.exports) — NÃO misturar
- Stripe: PaymentIntent + webhooks + Payment Request Button
- Firebase/Firestore: orders, rate_limits, abandoned_carts
- Resend: emails via api/lib/resend.js
- Logger: api/lib/logger.js — usar sempre nas API routes
- Sentry: api/lib/sentry.js

## Ficheiros críticos
- api/webhooks-stripe.js — idempotente via Firestore
- api/create-payment-intent.js — preços server-side + buildItemsMeta
- api/validate-coupon.js — validação de cupons Stripe
- api/catalog.js — proxy transparente para o internal
- api/lib/constants.js — catálogo completo, source of truth
- js/checkout.js — fluxo completo + Express Checkout
- js/account.js — auth, loyalty, dashboard
- js/cart-drawer.js — deve ser type="module" em todas as páginas
- js/homepage-prices.js — preços dinâmicos via /api/catalog
- vercel.json — rewrites, CSP, maxDuration

## Padrões obrigatórios

### Preços
- Catálogo: preços GROSS com IVA 23% incluído
- price_ex para o internal: gross / 1.23
- NUNCA enviar gross como price_ex
- buildItemsMeta(): guard de 490 chars para metadata Stripe

### Webhook
- Idempotente: verifica Firestore antes de processar
- Retorna 200 ao Stripe rapidamente
- Logger sempre — nunca console.log nas API routes
- POST para internal /api/sales/website é best-effort

### Express Checkout
- ev.complete('success') ANTES de qualquer redirect
- stripe.confirmCardPayment com handleActions: false

### Frontend
- ES modules — import/export
- Nunca hardcode de API keys
- cart-drawer.js: type="module" em TODAS as páginas

## Auth flow
- JWT em localStorage (TOKEN_KEY)
- Tab default: Sign in
- ?tab=register → abre registo
- JWT expirado → signout automático + toast
- Email verification: NÃO implementado ainda

## Fluxos críticos — testar após qualquer mudança
1. Carrinho → checkout → pagamento Stripe
2. Google Pay / Apple Pay → ev.complete → success page
3. Cupom → aplicado correctamente no total
4. Login → dashboard → Catokens visíveis
5. Registo com referral → +500 Catokens
6. Redeem → cupom Stripe gerado
7. Webhook → idempotente (segunda chamada não duplica)
8. Free shipping threshold → visível no carrinho

## Endpoints do internal que o site consome
- POST /api/sales/website — x-webhook-secret
- GET /api/loyalty/rank-discount — JWT
- GET /api/loyalty/points-summary — JWT ou CRM
- GET /api/reviews — público
- POST /api/reviews — público
- GET /api/products/:id — x-crm-secret (via api/catalog.js)

## Integration check — correr após mudanças de auth
- cart-drawer.js tem type="module" em todas as páginas?
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