# CLAUDE.md — electricink-ie

## O que é este projeto
Site público da Electric Ink IE: loja online, checkout com Stripe, 
sistema de loyalty (Black Cat Rewards), conta de cliente, e integração 
com o sistema interno (electricink-internal no Railway).

## Regras de trabalho — NUNCA VIOLAR
- Leia SEMPRE o arquivo completo antes de qualquer alteração
- Uma mudança cirúrgica por sessão — find → replace exato
- Nunca misturar este repo com o electricink-internal no mesmo prompt
- Nunca inventar nomes de funções, variáveis ou endpoints
- Descreva o problema com evidência do código antes de propor qualquer fix
- Nunca rewrites de arquitetura — só fixes cirúrgicos

## Stack
- Vercel (frontend estático + serverless API routes)
- Frontend: Vanilla JS com ES modules (`import`/`export`)
- API routes: CommonJS (`require`/`module.exports`) — NÃO misturar com ES modules
- Stripe: PaymentIntent, webhooks, Payment Request Button (Google/Apple Pay)
- Firebase/Firestore: orders, rate_limits, abandoned_carts
- Resend: emails transacionais via api/lib/resend.js
- Logger estruturado: api/lib/logger.js (usar sempre nas API routes)
- Sentry: api/lib/sentry.js (error tracking em produção)

## Comandos úteis
```bash
# Desenvolvimento local
vercel dev

# Deploy (automático via GitHub push para main)
git push origin main

# Testar webhook localmente
stripe listen --forward-to localhost:3000/api/webhooks-stripe
```

## Estrutura de arquivos críticos
```
api/
  webhooks-stripe.js         — handler de pagamentos (idempotente via Firestore)
  create-payment-intent.js   — validação server-side + buildItemsMeta guard
  validate-coupon.js         — validação e aplicação de cupons
  catalog.js                 — endpoint que serve o catálogo ao frontend
  config.js                  — configurações públicas para o frontend
  lib/
    constants.js             — catálogo completo: produtos, preços, variantes (source of truth)
    resend.js                — cliente Resend configurado
    logger.js                — logger estruturado para todas as API routes
    sentry.js                — Sentry setup
    firebase-admin.js        — Firestore admin SDK

js/
  checkout.js                — fluxo completo de checkout + Express Checkout
  account.js                 — conta de cliente, loyalty, histórico
  cart.js                    — lógica de carrinho
  cart-drawer.js             — UI do carrinho lateral
  product-page.js            — página de produto
  constants.js               — constantes compartilhadas entre módulos JS
  firebase-config.js         — Firebase SDK para o frontend

vercel.json                  — rewrites, headers CSP, maxDuration
```

## Padrões de código obrigatórios

### Preços
- `constants.js` (API): preços são GROSS com IVA 23% incluído
- `price_ex` enviado para o internal: `Math.round((grossPrice / 1.23) * 100) / 100`
- NUNCA enviar o gross como price_ex — o internal trata esse campo como ex-VAT

### Stripe metadata
- Limite Stripe: 500 chars por value
- Guard implementado: `buildItemsMeta()` em create-payment-intent.js (max 490 chars)
- Nunca serializar items sem passar por buildItemsMeta

### Express Checkout (Google Pay / Apple Pay)
- Evento `paymentmethod`: preencher form temporariamente com dados do payer
- Confirmação: `stripe.confirmCardPayment(..., {handleActions: false})`
- Chamar `ev.complete('success')` ANTES de redirect ou ações posteriores
- Restaurar valores originais do form após createPaymentIntent

### Webhook
- Idempotente: verifica `processedOrders/{orderId}` no Firestore antes de processar
- Sempre retornar 200 ao Stripe rapidamente (antes de processar internamente)
- Logger: `logger.info/warn/error` — nunca `console.log` diretamente nas API routes
- Após processar: POST para INTERNAL_API_URL/api/sales/website (best-effort, não bloqueia)

### Frontend JS
- ES modules — sempre usar `import`/`export`
- Nunca hardcode de API keys no JS do frontend
- Dados sensíveis (email, etc.) não persistir em localStorage além do necessário

## O que NÃO fazer
- Não adicionar dependências sem necessidade clara
- Não mover lógica de preços para o frontend (backend é source of truth)
- Não modificar vercel.json sem testar CSP e rewrites localmente
- Não alterar o schema Firestore sem atualizar firebase-admin.js
- Não usar `console.log` nas API routes — sempre o logger estruturado

## Fluxos críticos — testar após qualquer mudança
1. Adicionar produto ao carrinho → checkout → pagamento Stripe
2. Google Pay / Apple Pay → confirmação → success page
3. Cupom de desconto → aplicado correctamente no total
4. Login → dashboard → Catokens visíveis
5. Registo com referral code → +500 Catokens atribuídos
6. Redeem Catokens → cupom Stripe gerado e visível
7. Webhook Stripe → idempotente (segunda chamada não duplica)
8. Free shipping threshold → visível no carrinho e checkout

## Endpoints críticos do internal que o site consome
- POST /api/sales/website — registo de venda após pagamento
- GET /api/loyalty/rank-discount — desconto Legend/Black Cat
- GET /api/reviews — reviews de produtos
- POST /api/reviews — submissão de review
- GET /api/loyalty/points-summary — pontos após compra

## Historial de mudanças críticas
- 2026-03: CORS adicionado www.electricink.ie (fix Safari)
- 2026-03: Free shipping fix — 0 || x falsy bug corrigido
- 2026-03: cart-drawer.js deve ser type="module" em todas as páginas
- 2026-03: Tab default alterado para Sign in (não Join now)
- 2026-03: Debug via ?debug=true URL param removido
- 2026-03: PayPal/Klarna removidos dos ícones de pagamento aceites
- 2026-04: JWT expirado → signout automático com toast
- 2026-04: Indicador de força de password no registo

## Integration check — correr antes de qualquer deploy
Sempre que mudares auth, middleware ou endpoints:
- Verifica que todos os fetches ao internal têm o header correcto
- Verifica que cart-drawer.js tem type="module" em todas as páginas
- Verifica que preços no checkout batem com o catálogo