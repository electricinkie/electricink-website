# ROTATE_KEYS.md

Guia passo-a-passo para ROTACIONAR CHAVES e PURGAR segredos do repositório (ElectricInk.ie)

IMPORTANTE: execute essas ações com uma conta admin nos painéis (Stripe, Vercel, Resend, Sentry). Faça em janela de baixa atividade e tenha backups das variáveis atuais (em local seguro). Não execute o purge do Git sem coordenar com colaboradores.

---
## 1) Objetivo
- Rotacionar todas as chaves que possam ter sido expostas (Stripe, Stripe webhook secret, Resend, Sentry).
- Atualizar variáveis de ambiente no Vercel.
- Testar checkout + webhooks.
- (Opcional/avançado) Purgar histórico Git (BFG/git-filter-repo) se as chaves foram commitadas.

---
## 2) Rotacionar chaves — Stripe

1. Stripe Dashboard → Developers → API keys
   - Clique em `Rotate secret key` ou `Create secret key`.
   - Copie o novo `STRIPE_SECRET_KEY` (sk_live_... ou sk_test_... conforme ambiente).

2. Webhook signing secret
   - Developers → Webhooks → selecione endpoint (ou crie novo endpoint apontando para: `https://<SEU-DOMINIO-VERCEL>/api/webhooks-stripe`).
   - Clique em `Reveal signing secret` ou `Rotate` e copie `STRIPE_WEBHOOK_SECRET`.

3. Não revogar as chaves antigas ainda — primeiro atualize Vercel e teste.

---
## 3) Rotacionar chaves — Resend (email)

1. Login em Resend → Settings → API keys → Create new key
2. Copie o novo `RESEND_API_KEY`.

---
## 4) Rotacionar chaves — Sentry (se usar)

1. Sentry → Project → Client Keys (DSN) → Create / Rotate DSN
2. Copie `SENTRY_DSN` (ou deixe vazio para manter Sentry desativado até estabilidade).

---
## 5) Atualizar Vercel (variáveis de ambiente)

Via UI (recomendado):
- Vercel → Project → Settings → Environment Variables
- Atualize/adicione para o ambiente `Production` (e `Preview`/`Development` conforme necessário):
  - STRIPE_SECRET_KEY
  - STRIPE_PUBLISHABLE_KEY
  - STRIPE_WEBHOOK_SECRET
  - RESEND_API_KEY
  - SENTRY_DSN

Via Vercel CLI (exemplo):
```bash
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_PUBLISHABLE_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add RESEND_API_KEY production
vercel env add SENTRY_DSN production
```

Depois de atualizar, force um redeploy no Vercel (Trigger Deploy no painel).

---
## 6) Testes pós-rotacionamento

1. Testar webhooks:
```bash
stripe login
stripe listen --forward-to https://<SEU-DOMINIO-VERCEL>/api/webhooks-stripe
stripe trigger payment_intent.succeeded
```
Verifique logs do Vercel / `api/webhooks-stripe.js` para mensagem `Webhook signature verified`.

2. Testar checkout + 3DS (usar ambiente de teste do Stripe ou staging):
 - Cartão 3DS de teste: `4000 0025 0000 3155` (exp: qualquer futura, CVC: 123)
 - Confirmar fluxo em `js/checkout.js` (handlePaymentIntentStatus) e que `payment_intent.succeeded` cai no webhook.

3. Testar envio de emails via Resend: gerar order-notification-admin e order-confirmation para garantir que `api/send-order-email.js` funciona.

4. Conferir que `api/create-payment-intent.js` continua validando preços e retornando `clientSecret`.

---
## 7) Revogar chaves antigas

Só depois de confirmar que tudo funciona com as chaves novas:
- Stripe: revoke old secret keys
- Stripe Webhooks: remover endpoints antigos
- Resend/Sentry: delete old keys

---
## 8) Purge do Git history (BFG/git-filter-repo) — **OPCIONAL / IRREVERSÍVEL**

AVISO: isso reescreve o histórico; todos os colaboradores deverão re-clonar o repo após. Faça backup (`git clone --mirror`) antes.

Exemplo com BFG (recomendado para arquivos simples como `.env`):
```bash
# 1) Crie um mirror local
git clone --mirror git@github.com:SEU/REPO.git repo-mirror.git
cd repo-mirror.git

# 2) Use BFG para apagar arquivos .env e quaisquer ocorrências de chaves (palavras-chave)
bfg --delete-files .env
# Para substituir textos sensíveis, crie passwords.txt com padrões a remover
# ex: passwords.txt contém lines like: pk_test_..., sk_live_...
bfg --replace-text passwords.txt

# 3) Limpeza e push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

Alternativa com `git filter-repo` (mais flexível):
```bash
# Instale git-filter-repo
git clone --mirror git@github.com:SEU/REPO.git repo-mirror.git
cd repo-mirror.git
git filter-repo --invert-paths --paths .env
git push --force
```

Checklist antes de executar purge:
- Todos os colaboradores entendem que haverá force-push e precisam re-clonar.
- Backup do mirror criado.
- Rotacionadas todas as chaves (antes do push final).

---
## 9) Comandos para localizar segredos no repo (scan final)
```bash
# Procura por padrões comuns
git grep -n "sk_live_\|sk_test_\|pk_live_\|pk_test_\|RESEND_API_KEY\|SENTRY_DSN\|STRIPE_SECRET_KEY\|STRIPE_WEBHOOK_SECRET\|API_KEY" || true

# Procura por arquivos .env rastreados
git ls-files | grep ".env" || true
```

---
## 10) Observações finais / checklist de segurança mínima
- Mantenha `.env` no `.gitignore` (já configurado).
- Use secrets manager do provedor (Vercel envs). Não commit em texto.
- Configure Stripe Radar no Dashboard.
- Considere adicionar rate-limiting na função `create-payment-intent` (Edge or middleware) para mitigar abuso.

---
Se quiser, eu:
- (A) adiciono este `ROTATE_KEYS.md` ao repo (posso commitar agora). 
- (B) gero o arquivo `passwords.txt` com matches detectados para usar com BFG (não executo purge sem permissão).
