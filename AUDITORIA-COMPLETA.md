# AUDITORIA COMPLETA - IMPLEMENTAÇÕES RECENTES

> Escopo: Autenticação (Auth), Orders, OMS, Profile, integrações e dependências — alterações desde o commit `984c886`.

---

**Resumo rápido**
- Commit base: `984c886` verified.
- Objetivo: mapear arquivos alterados/novos, analisar módulos (frontend/backend), apontar riscos e fornecer recomendações.

---

**Parte 1 — Arquivos adicionados / modificados (984c886..HEAD)**

Comando executado: `git diff --name-status 984c886..HEAD` (repo root).

Arquivos MODIFICADOS (M):
- [.gitignore](.gitignore)
- [api/config.js](api/config.js)
- [api/create-payment-intent.js](api/create-payment-intent.js)
- [css/category-page.css](css/category-page.css)
- [css/checkout.css](css/checkout.css)
- [data/category-messages.json](data/category-messages.json)
- [data/product-accessories.json](data/product-accessories.json)
- [data/product-tattoo-machines.json](data/product-tattoo-machines.json)
- [data/products-artistic-inks.json](data/products-artistic-inks.json)
- [data/products-cosmetics.json](data/products-cosmetics.json)
- [data/products-needles-022.json](data/products-needles-022.json)
- [data/products-needles-025.json](data/products-needles-025.json)
- [data/products-needles-030.json](data/products-needles-030.json)
- [index.html](index.html)
- [js/category-page.js](js/category-page.js)
- [js/checkout.js](js/checkout.js)
- [js/desktop-header.js](js/desktop-header.js)
- [js/global-cart.js](js/global-cart.js)
- [js/mobile-header.js](js/mobile-header.js)
- [js/product-page.js](js/product-page.js)
- [success.html](success.html)

Arquivos ADICIONADOS (A):
- [data/products-power-supplies.json](data/products-power-supplies.json)
- Muitas imagens em `images/products/power-supplies/*` (vários arquivos listados)
- [scripts/normalize-stripe-priceid.js](scripts/normalize-stripe-priceid.js)
- [validate-products.sh](validate-products.sh)

Nenhum arquivo DELETADO (D) retornado pelo diff.

> Observação: `js/auth.js` e `js/orders.js` existem no workspace mas não foram alterados desde `984c886` (não aparecem no diff). O exame detalhado abaixo inclui esses arquivos porque fazem parte da implementação atual.

---

**Parte 2 — ANALISE: AUTH (Frontend & fluxo)**

Arquivos principais analisados:
- [js/auth.js](js/auth.js)
- [js/firebase-config.js](js/firebase-config.js)
- [profile.html](profile.html)
- Header scripts referencing auth: [js/desktop-header.js](js/desktop-header.js), [js/mobile-header.js](js/mobile-header.js)

1) Frontend (`js/auth.js`)
- Funções exportadas (confirmadas):
  - `initAuth(config)` — inicializa Firebase cliente (delegando a `initFirebase`).
  - `signUp(email, password)` — cria conta (Firebase Auth).
  - `signIn(email, password)` — sign-in com email/senha.
  - `signOutUser()` / `logout()` — sign out.
  - `onAuthChange(cb)` — listener wrapper para auth state changes.
  - `getCurrentUser()` — retorna user atual.
  - `createAuthModal()` — injeta modal de autenticação (UI).
  - `openAuthModal(tab)` / `openLoginModal()` / `openSignupModal()` — helpers UX.
  - `initAuthObserver()` — inicia observador e integra com header.
- Dependências e técnicas:
  - Usa Firebase modular SDK via dynamic `import()` (CDN URLs: firebase-auth, firebase-firestore, firebase-app).
  - Usa `initFirebase()` (em `js/firebase-config.js`) para obter `auth`/`db`.
  - mapAuthError() transforma códigos Firebase em mensagens amigáveis.
- Estado gerenciado: não mantém store central; usa `auth.currentUser` e callbacks.
- Eventos: `onAuthStateChanged` (via `initAuthObserver`) e handlers de formulário/modal.
- Integração com páginas: `profile.html` importa `initAuth`, `signIn`, `signUp`, `signOutUser`, `onAuthChange`, `getCurrentUser` (veja [profile.html](profile.html)). `desktop-header.js` e `mobile-header.js` também chamam `initAuthObserver()` para mostrar user info no header.

2) Backend (não há endpoints de "auth" propriamente — auth é Firebase Auth cliente + Admin no servidor):
- `api/lib/firebase-admin.js` inicializa Firebase Admin a partir da var de ambiente `FIREBASE_SERVICE_ACCOUNT` (ver seção dependências).
- Não há rotas de login customizadas; autenticação delegada ao Firebase.

3) Configuração/variáveis relevantes:
- `window.FIREBASE_CONFIG` esperado no cliente; `js/firebase-config.js` documenta exigência e fornece `initFirebase(config)`.
- `api/lib/firebase-admin.js` exige `FIREBASE_SERVICE_ACCOUNT` (JSON ou base64) para inicializar Admin em produção.

4) Páginas que usam / chamadas:
- [profile.html](profile.html) — inicializa auth no boot e usa `onAuthChange` para mostrar perfil e carregar pedidos.
- `desktop-header.js` / `mobile-header.js` — usam `initAuthObserver()` para integrar com o header (login/status UX).

5) Fluxo completo (cliente):
- Ao abrir `profile.html` ou header: `initAuth()` → `initAuthObserver()` → `onAuthChange` atualiza UI.
- Login/signup: chamadas a `signIn`/`signUp` → Firebase Auth → state change → callbacks.
- Proteção de rotas: não há proteção server-side — a página verifica cliente via `onAuthChange`. Se o app requer proteção server-side (SSR/API), é necessário validar tokens no backend.

Riscos/Observações (Auth):
- `window.FIREBASE_CONFIG` deve ser injetado corretamente nas páginas; se faltante, `initFirebase` lança.
- Segurança: as credenciais do Admin são obrigatórias para operações server-side e precisam ficar em variáveis de ambiente (NUNCA commitadas).
- O cliente usa imports CDN (ok), porém cuidado com disponibilidade de CDN em ambientes restritos.

Recomendações rápidas (Auth):
- Garantir páginas que chamam `initAuth()` têm `window.FIREBASE_CONFIG` setado (via `api/config.js` ou injeção no HTML).
- Para APIs sensíveis, usar verificação de ID token (verificar token no backend antes de operações privativas).

---

**Parte 3 — ANALISE: ORDERS (Frontend & Backend & Firestore)**

Arquivos principais:
- [js/orders.js](js/orders.js)
- [js/checkout.js](js/checkout.js) (integra `createOrder` no fluxo de sucesso)
- [api/create-payment-intent.js](api/create-payment-intent.js) (valida preços, calcula totals)
- [api/webhooks-stripe.js](api/webhooks-stripe.js) (webhook que grava orders no Firestore)

1) Frontend (`js/orders.js`)
- Funções exportadas:
  - `getAllOrders(limit = 100)` — consulta coleção `orders` (Firestore client SDK).
  - `getUserOrdersByEmail(email)` — consulta `orders` onde `customerEmail == email`.
  - `createOrder(orderData)` — adiciona documento em `orders` via `addDoc` (ID auto-generated). Fields: userId, userEmail, userName, items, total, status:'paid', stripePaymentIntentId, createdAt (Timestamp.now()) e shippingAddress.
- Dependências: `initFirebase` (client), Firestore (modular CDN import).
- Uso: `js/checkout.js` chama `createOrder(orderData)` depois do pagamento bem-sucedido (client-side), e `handlePaymentSuccess` também tenta salvar o pedido.

2) Backend / Webhook (`api/webhooks-stripe.js`)
- Webhook `payment_intent.succeeded` → `handlePaymentIntentSucceeded`:
  - Extrai metadata do PaymentIntent (items, subtotal_cents, shipping_cents, customer metadata).
  - Cria um documento em Firestore `orders` com ID explícito = `paymentIntent.id` (document ID = Stripe PI id) usando uma transaction para garantir idempotência.
  - Envia e-mails (Resend) em background; atualiza campos de email no documento.
- Observação importante: webhook usa doc id = paymentIntent.id; cliente usa addDoc (auto-id). Isso cria potencial duplicação (mesmo pedido salvo duas vezes com IDs diferentes).

3) Firestore (collections):
- `orders` collection — gravações client-side usam auto-id, webhook usa `paymentIntent.id`.
- `order-events` e `failed_emails` também existem/ são usadas pelo OMS/webhook.

4) Fluxo completo (E2E):
- Checkout (cliente) confirm → `createOrder(orderData)` client-side (auto-id) — chamado em `js/checkout.js` após sucesso em `handlePaymentSuccess`.
- Webhook Stripe recebe `payment_intent.succeeded` → cria/atualiza documento `orders` com doc id `paymentIntent.id` (source: webhook).

Problemas/risks (Orders):
- Duplicação possível: client cria uma ordem (auto-id) e webhook cria outra com `paymentIntent.id`. Atualmente não há lógica que mapeie/associe o auto-id do cliente com o doc do webhook. Fonte de verdade: backend/webhook deve ser considerado fonte de verdade.
- Inconsistência de IDs: client-side `createOrder` retorna `docRef.id` (auto), webhook usa `paymentIntent.id`.
- Permissões Firestore: `profile.html` chama `getUserOrdersByEmail` no cliente; isso só funcionará se Firestore rules permitirem consultas por `customerEmail` para o usuário autenticado ou para leitura pública.

Recomendações (Orders):
- Remover gravação client-side de orders OR garantir deduplicação (ex.: salvar localmente e só confiar no webhook; cliente pode write com doc id = paymentIntent.id caso receba client_secret/intent id do backend depois da confirmação).
- Padronizar doc ID (recomendo: `paymentIntent.id` como única fonte e evitar gravação duplicada no cliente).
- Garantir regras Firestore que permitam leitura de pedidos apenas para o dono do pedido.

---

**Parte 4 — ANALISE: OMS (Order Management System)**

Arquivo principal:
- [api/oms/order-manager.js](api/oms/order-manager.js)

1) Módulo OMS (order-manager.js):
- Classe `OrderManager(db)` com métodos:
  - `generateOrderNumber()` — usa documento `counters/orders` para gerar um número sequencial: `ORD-YYYYMMDD-NNNN` (transactional).
  - `enrichOrder(paymentIntentId)` — busca order pelo `paymentIntentId` (usa doc id = paymentIntentId), gera `orderNumber`, atualiza order com `orderNumber`, `userId`, `omsEnrichedAt`, e cria evento em `order-events`.
  - `updateStatus(paymentIntentId, newStatus, note)` — atualiza `orders/{paymentIntentId}.status` e grava evento em `order-events`.
- Dependências: `firebase-admin` (admin SDK), usa `admin.firestore.FieldValue`.

2) Integração atual:
- No repositório não há chamadas detectadas a `OrderManager` (grep não encontrou usos além do próprio arquivo). Ou seja: OMS está presente, mas NÃO aparece integrado automaticamente ao webhook ou a create-order flow.

3) Estado: Parcialmente implementado mas não integrado.

Riscos/Observações (OMS):
- Livro de regras: o OMS assume que orders são gravadas com doc id = `paymentIntent.id`. Se a gravação for feita com auto-id (cliente) o `enrichOrder` não encontrará o documento.
- Integração necessária: webhooks (ou job agendado) deveriam chamar `OrderManager.enrichOrder(paymentIntentId)` para gerar `orderNumber` e eventos.

Recomendação (OMS):
- Integrar `OrderManager` no fluxo de webhook **imediatamente após** a criação do documento em `handlePaymentIntentSucceeded` para garantir `orderNumber` e eventos consistentes.
- Caso opte por manter gravação client-side, adicionar um reconciler que vincule auto-id → paymentIntent.id (mas preferir usar only webhook writes).

---

**Parte 5 — ANALISE: PROFILE (Frontend / Dados do usuário)**

Arquivos analisados:
- [profile.html](profile.html)
- (client) [js/auth.js](js/auth.js)
- (client) [js/orders.js](js/orders.js)

1) Página `profile.html`:
- Fluxo: importa `initAuth` e `onAuthChange` de `js/auth.js` e `getUserOrdersByEmail` de `js/orders.js`.
- Ao autenticar, `onAuthChange` carrega pedidos com `getUserOrdersByEmail(user.email)` e exibe lista.
- Proteção: apenas client-side — se um usuário não autenticado tentar requisitar a coleção de pedidos, as regras Firestore precisam proteger o acesso.

2) Backend: não há endpoint específico para profile; tudo é via Firestore client.

3) Integração: leitura de orders por email depende de Firestore rules. Se regras não permitirem, a página mostrará erro.

Recomendações (Profile):
- Preferir endpoint server-side que valide ID token e retorne orders do usuário, em vez de consultas client-side por e-mail (evita exposição de índices e erros de regras).

---

**Parte 6 — Dependências e Configuração (envs)**

Principais arquivos/configs:
- [api/lib/firebase-admin.js](api/lib/firebase-admin.js)
- [api/create-payment-intent.js](api/create-payment-intent.js)
- [api/webhooks-stripe.js](api/webhooks-stripe.js)
- [api/config.js](api/config.js) (expõe `STRIPE_PUBLISHABLE_KEY` para cliente)
- [package.json](package.json)

Variáveis de ambiente identificadas (usadas no código):
- `FIREBASE_SERVICE_ACCOUNT` (obrigatório em produção para admin)
- `STRIPE_SECRET_KEY` (backend)
- `STRIPE_PUBLISHABLE_KEY` (frontend via api/config.js)
- `STRIPE_WEBHOOK_SECRET` (webhooks signature validation)
- `RESEND_API_KEY` (opcional, e-mail)
- `ADMIN_EMAIL`, `EMAIL_FROM` (e-mail admin configuration)
- `NODE_ENV` / `VERCEL_ENV` (runtime checks)

Dependências (package.json):
- stripe, firebase-admin, resend, @sentry/node/@sentry/browser, express, dotenv, etc.

Config cliente: `window.FIREBASE_CONFIG` — setado em páginas (documented in `js/firebase-config.js`). `api/config.js` expõe `window.STRIPE_PUBLISHABLE_KEY` endpoint.

---

**Parte 7 — Impacto no Checkout E2E**

Antes (fluxo básico):
- Add to cart → localStorage → Cart page → Checkout → Stripe → Payment → success → Webhook grava Firestore → Email enviado.

Agora (com Auth/Orders/OMS/Profile):
- Checkout client chama `createPaymentIntent` (backend) e `confirmCardPayment`; em `handlePaymentSuccess` o cliente chama `createOrder()` (client addDoc) e, separadamente, webhook grava a order baseada no PaymentIntent.
- Pontos de duplicação: cliente grava order (auto-id) e webhook grava com id = paymentIntent.id — duplicação detectada.
- OMS não integrado: order-manager existe mas não é chamado; portanto `orderNumber` sequencial não é garantido.
- Auth não é exigido para checkout (guest flow ainda funciona) — perfil é opcional.

Principais riscos E2E:
1. Duplicação de pedidos entre cliente e webhook — confusão nos relatórios, emails e faturação.
2. Incoerência de IDs — impossível reconciliar sem lógica adicional.
3. Falta de integração OMS — ausência de `orderNumber` sequencial até que OMS seja acionado.
4. Regras Firestore/Segurança: `getUserOrdersByEmail` depende de regras; se permissões abertas, vazamento; se restritas, `profile.html` pode falhar.

Recomendações (prioritárias):
- Urgente: Parar gravação client-side do pedido ou alterar para usar `paymentIntent.id` como doc id (apenas após receber o `paymentIntent.id` do backend).
- Urgente: Ajustar webhook para também enrich com `OrderManager` (ou chamar `OrderManager.enrichOrder` após persistir).
- Importante: Validar regras Firestore para que leitura de orders seja apenas para o dono (ou migrar leitura via backend autenticado que valida o ID token).

---

**Parte 8 — Relatório de problemas identificados e recomendações prioritárias**

Problemas críticos (🔴 URGENTE):
- Duplicação de orders (cliente `addDoc` vs webhook `doc(paymentIntent.id)`). Risco: duplicação de emails/stock/contabilidade.
- Ausência de integração OMS com webhook (OrderManager presente, não usado).
- `FIREBASE_SERVICE_ACCOUNT` obrigatório em produção — se ausente, backend lança.

Importante (🟡):
- Firestore rules não verificadas — garantir que `orders` não é consultável por e-mail sem autenticação/validação.
- `window.FIREBASE_CONFIG` deve ser corretamente injetado em páginas que usam Firebase.

Melhorias futuras (🟢):
- Centralizar gravação de orders apenas no webhook (fonte de verdade) e enviar feedback ao cliente (via redirect/consulta de status).
- Implementar reconciliação automática entre auto-id (cliente) e `paymentIntent.id` (webhook) caso já existam dados históricos.
- Integrar `OrderManager` para gerar `orderNumber` e registrar events atomically.

---

**Checklist de validação (prática)**

Auth:
- [ ] `initFirebase` funciona em todas as páginas que chamam.
- [ ] Login/Signup/Logout testados (incluindo error mapping).
- [ ] `onAuthChange` atualiza header/profile.

Orders/Webhook:
- [ ] Webhook grava `orders/{paymentIntent.id}` corretamente.
- [ ] Cliente NÃO grava ordem duplicada (ou se gravar, existe reconciliação).
- [ ] Emails (Resend) configurados e verificados.

OMS:
- [ ] `OrderManager` integrado ao webhook/enrichment flow.
- [ ] `counters/orders` index/permission funcionando para `generateOrderNumber`.

Profile:
- [ ] `getUserOrdersByEmail` funciona com regras atuais (ou migrar para endpoint servidor que valida idToken).

Env & Config:
- [ ] `FIREBASE_SERVICE_ACCOUNT` configurada em produção.
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` configurados.
- [ ] `RESEND_API_KEY` configurado (se desejar emails via Resend).

---

**Anexos — pontos de entrada / arquivos chave**
- Auth (client): [js/auth.js](js/auth.js) — modal + auth helpers
- Firebase client init: [js/firebase-config.js](js/firebase-config.js)
- Orders (client): [js/orders.js](js/orders.js)
- Checkout (client): [js/checkout.js](js/checkout.js) — onde `createOrder` é chamado
- Webhook (server): [api/webhooks-stripe.js](api/webhooks-stripe.js) — cria `orders/{paymentIntent.id}`
- Payment intent backend: [api/create-payment-intent.js](api/create-payment-intent.js) — valida preços server-side
- Firebase Admin init: [api/lib/firebase-admin.js](api/lib/firebase-admin.js)
- OMS module: [api/oms/order-manager.js](api/oms/order-manager.js)
- Config exposure to client: [api/config.js](api/config.js)

---

Se desejar, posso:
- 1) aplicar uma correção rápida para evitar duplicação (ex.: remover/disable `createOrder` client-side ou fazer `createOrder` usar `paymentIntentId` quando disponível);
- 2) integrar `OrderManager.enrichOrder` ao final de `handlePaymentIntentSucceeded` no webhook;
- 3) gerar um resumo de mudanças necessário para deploy (variáveis env e checagens pré-deploy).

Quer que eu: (A) gere um patch para evitar gravação client-side duplicada, (B) integre `OrderManager` ao webhook, ou (C) gere passos para validar/atualizar Firestore rules? Escolha uma opção para eu aplicar o próximo passo.
