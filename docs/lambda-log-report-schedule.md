# Relatório periódico dos logs da Lambda

## Prompt para o Agendador do Codex

Analise, somente para leitura, os logs CloudWatch da função Lambda da API deste workspace para a janela de cinco dias encerrada no horário agendado. Use a região e o grupo de logs configurados para a função. Antes da coleta, confirme a identidade AWS e valide que o grupo consultado corresponde à função esperada. Não imprima credenciais.

Use os registros `HTTP request completed` produzidos pela API para contar requisições. Agrupe por método, rota e status HTTP. Considere `2xx` como respostas bem sucedidas, `4xx` como rejeições/erros de cliente e `5xx` como falhas de serviço. Analise candidaturas nos endpoints `POST /api/candidates` e `POST /api/candidates/applications`; deixe claro que outras rotas representam outras operações. Não conclua que uma candidatura foi gravada apenas pela ausência de erro: use a resposta HTTP e os eventos de persistência correlacionados por `requestId`, quando disponíveis.

Entregue o relatório em português com:

1. Resumo executivo para negócio: total de requisições, candidaturas com sucesso, candidaturas rejeitadas/fracassadas e comparação com os cinco dias anteriores.
2. Análise técnica: totais por método/rota/status, falhas `5xx`, rejeições `4xx`, duração média e p95 se os dados permitirem, causas visíveis e IDs de requisição para investigação.
3. Qualidade dos dados: janela efetivamente consultada, eventos ausentes/incompletos, invocações sem requisição HTTP e limitações. Sem registros HTTP, classifique números por endpoint como indisponíveis; não estime nem invente resultados.

Não inclua nomes, emails, documentos, tokens, corpos de requisição, currículos ou outros dados pessoais. Gere primeiro o relatório na execução do Codex. Depois envie a versão resumida pelo Amazon SES aos destinatários configurados fora do repositório. Use um remetente verificado e não coloque endereços ou credenciais no prompt. Se a consulta CloudWatch ou o envio SES falhar, informe o erro e não declare o email enviado.

## Agendamento e pré-requisitos

- Periodicidade pretendida: intervalo real de cinco dias, às 18:00 em `America/Sao_Paulo`, iniciando em 17/11/2026.
- Janela inicial pretendida: 12/11/2026 18:00 até 17/11/2026 18:00 (horário de São Paulo); as próximas janelas devem ser contíguas e sem sobreposição.
- Confirme que a interface de agendamento aceita intervalo de cinco dias e confira as datas previstas. Não substitua por uma expressão de calendário que altere o intervalo ao atravessar o mês.
- A sessão agendada precisa de acesso ao workspace e credenciais AWS disponíveis com permissões somente de leitura dos logs. Para SES, conceder apenas a permissão de envio necessária, com remetente verificado e destinatários configurados fora do Git.
- Realize a primeira execução como conferência manual antes de confiar nos relatórios periódicos. Execuções dependentes dos arquivos locais requerem o computador ligado e o app Codex aberto.

## Novo formato de log HTTP

Depois do deploy desta versão, cada resposta sob `/api` gera um evento JSON `HTTP request completed` com `requestId`, `method`, `route`, `statusCode` e `durationMs`. Os períodos anteriores ao deploy não têm cobertura uniforme; rotule comparações históricas como parciais.
