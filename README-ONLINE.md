# Meli Auto Online — usuário único

Esta versão preserva o motor da v3 e troca o armazenamento local por PostgreSQL.
Nenhuma recomendação é aplicada automaticamente: alterações continuam exigindo aprovação.

## GitHub
Envie a pasta para um repositório PRIVADO. O `.gitignore` impede `.env` e dados locais.
Nunca publique Client Secret, senha, token ou DATABASE_URL no repositório.

## Banco persistente
Crie um PostgreSQL persistente (Supabase/Neon ou outro compatível) e copie a connection string para `DATABASE_URL`.
A aplicação cria automaticamente a tabela `meli_auto_store` no primeiro start.

## Render
1. New > Blueprint (ou Web Service) e conecte o repositório.
2. Configure as variáveis secretas solicitadas no `render.yaml`.
3. Após o primeiro deploy, copie a URL HTTPS real do serviço.
4. Defina `MELI_REDIRECT_URI=https://SEU-SERVICO.onrender.com/auth/callback`.
5. Cadastre EXATAMENTE a mesma URL como Redirect URI no app do Mercado Livre.
6. Faça novo deploy/restart e abra a URL do Render.
7. Entre com `APP_PASSWORD` e clique em conectar Mercado Livre uma vez.

## Netlify e EXE
Não são necessários nesta versão online. Não apague sua versão local; ela é o backup funcional.
