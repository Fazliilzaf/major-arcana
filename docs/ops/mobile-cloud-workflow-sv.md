# Arcana från mobilen (utan dator)

Mål:
- du ska kunna köra Arcana från telefonen med stabil deploy och verifiering

## 1) Första setup (en gång)

I GitHub-repot, öppna:
- `Settings` -> `Secrets and variables` -> `Actions`

Lägg in dessa secrets:
- `ARCANA_PUBLIC_BASE_URL` = `https://arcana.hairtpclinic.se`
- `ARCANA_OWNER_EMAIL` = din owner e-post
- `ARCANA_OWNER_PASSWORD` = ditt owner lösenord
- `ARCANA_OWNER_MFA_SECRET` eller `ARCANA_OWNER_MFA_RECOVERY_CODE`
- `RENDER_DEPLOY_HOOK_URL` = Deploy Hook URL från Render

Så hittar du Deploy Hook i Render:
1. Öppna din Arcana service i Render
2. Gå till `Settings`
3. Öppna sektionen för `Deploy Hook`
4. Skapa eller kopiera hook-URL
5. Klistra in den i GitHub-secret `RENDER_DEPLOY_HOOK_URL`

## 2) Dagligt flöde i telefonen (utan dator)

1. Öppna repo i GitHub-appen eller webben.
2. Gå till `Actions`.
3. Kör workflow `arcana-deploy-cloud-safe`.
4. Låt `skip_predeploy` stå på `false`.
5. Låt `tenant_id` vara `hair-tp-clinic` om du inte aktivt byter tenant.
6. Tryck `Run workflow`.

Vad workflowen gör:
- kör predeploy-checkar mot publik miljö (`smoke:public` + readiness guard + stability report)
- triggar deploy i Render via deploy hook
- väntar tills `/readyz` är grön
- kör `smoke:public` efter deploy

## 3) När du ska använda vilket workflow

- `arcana-deploy-cloud-safe`:
  använd detta som standard när du vill deploya säkert från mobilen.
- `arcana-predeploy-cloud`:
  använd detta när du bara vill kontrollera läget utan deploy.

## 4) Om något blir rött

1. Öppna failed job i GitHub Actions.
2. Kontrollera första `::error::`-raden i loggen.
3. Vanligaste fel:
- saknad secret
- fel `ARCANA_PUBLIC_BASE_URL`
- MFA-secret/recovery saknas eller är fel
- tjänsten hinner inte bli ready inom väntetiden

## 5) Direktlänkar

- Publik app: `https://arcana.hairtpclinic.se`
- Admin: `https://arcana.hairtpclinic.se/admin`
