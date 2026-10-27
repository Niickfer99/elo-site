# Elo — lançamento com GitHub Pages + Supabase

Projeto de comunidade cristã privada, exclusivo para adultos (18+). Site estático em HTML/CSS/JS com backend real no Supabase. **Não é possível lançar somente enviando os arquivos ao GitHub: siga a configuração abaixo.**

## 1. Criar o Supabase

1. Acesse https://supabase.com/dashboard e crie um projeto (anote a senha do banco em local seguro).
2. Em **SQL Editor**, crie uma nova query, cole TODO o conteúdo de `schema.sql` e execute uma única vez. Verifique se terminou sem erros. Em caso de erro, interrompa a publicação e corrija antes de continuar.
3. Em **Authentication → Providers → Email**, habilite autenticação por e-mail e **confirmação de e-mail**. Em **Authentication → URL Configuration**, defina a Site URL para a URL final do GitHub Pages e adicione a mesma URL às Redirect URLs. Antes de conhecer a URL final, você pode usar uma URL temporária e atualizar depois.
4. Configure um provedor SMTP confiável em Authentication para envio de e-mails de confirmação e recuperação de senha em produção. O envio padrão do Supabase pode ter restrições.
5. Em **Project Settings → API** (a nomenclatura pode variar), copie a **Project URL** e a **publishable key** (ou chave pública `anon` legada). Coloque-as em `config.js`. **Nunca coloque `service_role`, secret key ou senha do banco no GitHub.**

## 2. Criar o primeiro administrador

O primeiro convite deve ser criado pelo proprietário do banco. **Não use um código fácil de adivinhar.**

1. Gere localmente um código aleatório de pelo menos 24 bytes (48 caracteres hexadecimais), por exemplo com `python -c "import secrets; print(secrets.token_hex(24))"`. Guarde o código fora do repositório.
2. No Supabase SQL Editor, execute (substituindo o valor entre aspas):

```sql
insert into public.invites(code_hash,expires_at)
values (encode(extensions.digest('COLE_SEU_CODIGO_ALEATORIO','sha256'),'hex'),now()+interval '7 days');
```

3. Crie uma conta no site, confirme o e-mail, faça login e complete o perfil usando esse convite.
4. Em **Table Editor → members**, encontre o registro da sua conta. No SQL Editor, substitua o UUID da sua conta e execute:

```sql
update public.members
set status='approved', is_admin=true
where id='COLE_SEU_UUID';
```

5. Recarregue o site. Na aba **Perfil**, seu painel administrativo aparecerá. Agora você poderá gerar convites de uso único e aprovar os próximos membros.

**Importante:** não conceda `is_admin` a contas que você não verificou pessoalmente. A aprovação deve ser feita por adultos responsáveis pela comunidade.

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo `elo-site`.
2. Envie para a raiz os arquivos `index.html`, `app.js`, `style.css`, `config.js` e `README.md`. **Não é necessário publicar `schema.sql`, mas não há segredo nele.**
3. Em **Settings → Pages → Build and deployment**, selecione **Deploy from a branch**, branch `main`, pasta `/(root)` e salve.
4. Aguarde o GitHub mostrar o endereço, por exemplo `https://SEU_USUARIO.github.io/elo-site/`.
5. Copie esse endereço exato para **Authentication → URL Configuration** do Supabase, em Site URL e Redirect URLs (inclua a barra final, se houver).
6. Teste cadastro e confirmação de e-mail em uma janela anônima.

## 4. Fluxo real

- Conta com e-mail e senha → confirmação do e-mail → código de convite válido → cadastro completo com foto → status `pending`.
- Administrador aprova → status `approved` → perfil entra no diretório.
- Somente membros aprovados podem consultar perfis, enviar interesses e ler solicitações.
- O telefone não faz parte dos resultados de busca. O servidor só o retorna se existir solicitação aceita envolvendo os dois usuários e nenhum bloqueio.
- O botão de WhatsApp é disponibilizado apenas depois da aceitação.
- A porcentagem de afinidade é uma estimativa simples, calculada no navegador com base em personalidade, valores declarados, objetivo, idade, localização e hobbies. Não é uma previsão de relacionamento.
- Fotos ficam em bucket privado; URLs temporárias são emitidas apenas para membros aprovados ou o próprio dono.

## 5. Testes indispensáveis antes de convidar pessoas

1. Criar conta sem confirmar e-mail: não deve conseguir participar.
2. Tentar código inválido, expirado e já usado: deve ser rejeitado.
3. Criar perfil válido: fica pendente até aprovação.
4. Fazer login com conta pendente: não deve consultar diretório.
5. Aprovar pelo admin: membro passa a ver outros membros aprovados.
6. Enviar interesse: destinatário vê solicitação; remetente não vê telefone.
7. Recusar: telefone continua inacessível. Aceitar: contato passa a estar disponível.
8. Bloquear: contato deixa de ser acessível e novas solicitações são impedidas.
9. Testar em celulares diferentes, e-mail de confirmação, redefinição de senha e regras de acesso ao Supabase.
10. Revisar políticas de privacidade, consentimento, exclusão de dados, moderação e LGPD com orientação jurídica adequada antes de coletar dados reais.

## 6. Limitações e pendências antes de abrir ao público

- **Exclusão total de conta:** o botão atual remove o perfil e interesses, mas não exclui o usuário em `auth.users` nem necessariamente todos os arquivos de foto. Configure um fluxo privilegiado de exclusão integral e política de retenção, ou faça a remoção administrativa mediante solicitação. Não prometa exclusão completa enquanto isso não estiver implementado.
- **Denúncias:** são registradas no banco, mas o painel atual não mostra fila de denúncias. Administradores devem acompanhá-las pelo Supabase Table Editor e definir procedimentos de resposta.
- **Edição de perfil:** após aprovação, a edição ainda não está implementada. É necessário adicioná-la antes de uso público prolongado.
- **Verificação de idade:** a data é autodeclarada, não é verificação de identidade. Adote processo proporcional de verificação e moderação.
- **Consentimento e LGPD:** antes do lançamento, disponibilize política de privacidade, termos, base legal adequada, contato de suporte e processo de atendimento de direitos. Dados religiosos são dados pessoais sensíveis no Brasil.
- **Abuso:** adicionar limites de requisições, controles antispam e monitoramento de acessos, inclusive para criação de contas, convites, interesses e denúncias.
- **Segurança:** solicite uma revisão independente de políticas RLS, funções `security definer`, privacidade das fotos e fluxos de autorização antes de coletar dados reais. Não considere este código auditado.
- **Revogação de contato:** desfazer conexão impede novas consultas no site, mas não apaga um número que já tenha sido visto ou salvo.
- **Recuperação de senha:** usa fluxo simplificado; teste cuidadosamente antes do lançamento.

## 7. Arquivos

- `index.html` — página principal
- `style.css` — identidade azul e areia
- `app.js` — interface e integração Supabase
- `config.js` — URL e chave pública do Supabase
- `schema.sql` — tabelas, regras de acesso, funções e bucket privado
- `README.md` — este guia

Este projeto é uma **base funcional para testes fechados**, não uma certificação de segurança ou conformidade jurídica. Comece com contas de teste e não convide membros reais antes de concluir as pendências acima.
