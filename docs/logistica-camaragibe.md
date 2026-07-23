# Logística Camaragibe - Divinópolis - Surgery For Life

Guia prático para operação de estoque em casa no Condomínio Divinópolis, Camaragibe-PE até cliente final.

## 1. Estoque Físico em Casa

**Local:** Condomínio Divinópolis, Camaragibe-PE
- 3 caixas plásticas grandes com tampa
  - Caixa 1: Tamanhos P e M
  - Caixa 2: Tamanhos G e GG
  - Caixa 3: Coleção nova / pronta entrega
- Etiquetas nas caixas: `M Navy = 10 unid`
- Local seco, arejado, não direto no chão (Camaragibe é úmido)
- Contagem física 1x por semana pela responsável
- App Bling/Tiny no celular para dar baixa no físico ao separar

Segurança: Não divulgar endereço exato público, usar apenas "Camaragibe-PE" na etiqueta.

## 2. Organização Digital - Sistema V2 Impecável

Sistema em `/estoque` com:
- Dashboard: SKUs, unidades, baixo estoque, valor custo
- Entradas: data, fornecedor, custo lote
- Saídas: venda WhatsApp, cliente/pedido, motivo
- Estoque atual: saldo real + valor total + status OK/BAIXO/ZERADO
- Histórico completo com saldo depois + export CSV

Todos os movimentos geram `saldoDepois` auditável.

## 3. Embalagem Premium

Custo médio por pedido: R$ 3,95
- Caixa parda 30x20x10: R$ 1,80 ( lote 100un Mercado Livre )
- Saco com lacre: R$ 0,90
- Fita personalizada kraft 100m: R$ 35 (rende 150 caixas = R$ 0,20/caixa)
- Cartão agradecimento 9x6cm 300g: R$ 0,35
- Sachê perfumado: R$ 0,40
- Papel A4 etiqueta + tinta: R$ 0,30

Fluxo:
1. Dobrar scrub, colocar no saco lacre
2. Colocar cartão + sachê
3. Fechar caixa com fita
4. Imprimir etiqueta Melhor Envio em A4 comum e colar com fita transparente larga no centro da caixa
5. Colocar Declaração de Conteúdo ou DANFE dentro da caixa

## 4. Etiqueta - O que colar na caixa

**Etiqueta de Envio (por fora, obrigatória):**
- Remetente: Surgery For Life - Nome - Condomínio Divinópolis - Camaragibe-PE - CEP
- Destinatário: Cliente
- Código rastreio + QR Code
- Peso e dimensões

Gerada no Melhor Envio: CEP origem Camaragibe + destino cliente, peso 400g, dimensões 30x20x10. Já paga online com 30-40% desconto vs balcão. Não paga nada no Correios.

**Declaração de Conteúdo / NF (dentro):**
- Sem CNPJ: Declaração de Conteúdo modelo Correios escrita à mão ou digitada: "Declaro que envio 1x Scrub Surgery For Life valor R$ 397"
- Com CNPJ/MEI: DANFE via Bling/Tiny + PDF por WhatsApp

## 5. Transporte: Divinópolis → Centro Camaragibe → Cliente

Distância Divinópolis → Centro Camaragibe: ~5km, 12min Uber R$ 15-20.

**Opção A - Levar pessoalmente nos Correios Centro:**
Juntar pedidos do dia e levar. Custo balcão R$ 35-45, fila 40min-1h. Usar só nos 10 primeiros pedidos para aprender.

**Opção B - RECOMENDADA - Coleta Jadlog em casa via Melhor Envio:**
1. Gera etiqueta Jadlog no Melhor Envio
2. Clica "Solicitar coleta" - endereço Divinópolis
3. Motoboy Jadlog busca na portaria no dia seguinte - custo coleta R$ 0 com 1+ caixa
4. Frete Jadlog: R$ 18-28 média BR, mais barato que Correios, entrega 2-4 dias com rastreio
5. Muito melhor para condomínio

**Rotina recomendada:**
- Pedidos seg-qua → coleta quinta
- Pedidos qui-sáb → coleta segunda
- 2x por semana, não todo dia

**Opção C - Motoboy fixo (futuro 60+ pedidos/mês):**
Negocia motoboy fixo Camaragibe R$ 300/mês para buscar 3x/semana no Divinópolis e levar no ponto Jadlog.

**Custo total por envio:**
Caixa R$ 1,80 + Saco R$ 0,90 + Cartão R$ 0,35 + Sachê R$ 0,40 + Fita R$ 0,20 + Etiqueta R$ 0,30 + Frete Jadlog R$ 22 = **R$ 25,95** + custo scrub

Cobra do cliente R$ 29,90 ou frete grátis acima R$ 399 (lucra R$ 7,90 no frete).

## 6. Ferramentas que salvam

- Bling ou Tiny ERP R$ 50/mês: controle estoque + NF + app celular
- Melhor Envio (grátis): etiqueta com desconto + coleta Jadlog
- Z-API / Wati R$ 80/mês: WhatsApp API selo verde + chatbot
- Tidio (grátis): chatbot site
- Canva Pro R$ 35/mês: banners em 10min
- Trello/Notion (grátis): Kanban A Fazer / Fazendo / Feito
