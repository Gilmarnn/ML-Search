# Meli Auto — análise semiautomática de anúncios

Ferramenta local de uso pessoal para Mercado Livre. O sistema varre a conta, encontra anúncios com sinais de problema, pesquisa anúncios semelhantes, gera recomendações e exige aprovação explícita para cada alteração.

## Fluxo

1. Conectar conta via OAuth.
2. Configurar critérios de análise e proteção financeira.
3. Clicar **Analisar conta agora**.
4. Revisar candidatos e sugestões.
5. Aprovar individualmente título, descrição ou preço.
6. Consultar histórico.

A análise nunca altera anúncios. Mesmo a análise agendada apenas atualiza as recomendações.

## Proteção de preço

Preço só pode ser reduzido quando:
- há custo cadastrado para o anúncio;
- tarifa percentual do Mercado Livre está configurada;
- o preço sugerido fica acima do piso calculado com custo, tarifas, impostos e margem mínima;
- a redução respeita o limite máximo por alteração.

O cálculo é uma trava baseada nos valores informados pelo usuário, não uma apuração fiscal automática.

## Fotos

Nesta versão, fotos são apenas diagnosticadas por quantidade. Não há criação/substituição automática de imagens.

## Execução

```powershell
npm.cmd install
npm.cmd start
```

Para gerar o executável depois dos testes:

```powershell
npm.cmd run build:win
```


## v3 — análise aprofundada
- Nova análise limpa imediatamente a fila anterior.
- Busca de concorrentes em camadas, ampliando palavras-chave quando necessário.
- Exibe menor, mediana, média, maior, diferença percentual e amostra clicável.
- Título e descrição sugeridos são editáveis antes da aprovação.
- Anúncios sem vendas e com baixa exposição podem receber sugestão de título mesmo sem amostra forte, usando apenas termos/atributos do próprio anúncio.
- Fotos são mostradas para revisão visual; quantidade isolada não gera promessa de melhoria.
- Preço continua protegido por custo, tarifa, margem e limite máximo de redução.
