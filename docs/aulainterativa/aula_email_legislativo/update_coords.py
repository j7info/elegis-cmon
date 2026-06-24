import json
import os

filepath = "/Users/jeferson/Projetos/elegiscmon/docs/aulainterativa/aula_email_legislativo/simulacao/data.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

json_str = content.replace("const lessonData = ", "").strip()
if json_str.endswith(";"):
    json_str = json_str[:-1]

data = json.loads(json_str)

for step in data:
    text = step["text"].lower()
    img = step["image"]
    
    # Defaults
    x, y = 50, 50
    
    # == LOGIN SCREEN ==
    if "07.49.31" in img:
        if "usuário" in text:
            x, y = 50, 42
        elif "senha" in text and "esqueceu" not in text:
            x, y = 50, 50
        elif "esqueceu a senha" in text:
            x, y = 50, 58
        elif "login" in text and "botão verde" in text:
            x, y = 50, 68
        elif "idioma" in text or "lua" in text or "bandeira" in text:
            x, y = 92, 10
        elif "fido2" in text or "webauthn" in text:
            x, y = 50, 78

    # == MAIN MAIL INTERFACE ==
    elif "07.49.52" in img or "07.50.55" in img or "07.50.59" in img or "07.51.03" in img or "07.51.08" in img or "07.51.12" in img or "07.51.41" in img or "07.52.56" in img:
        # Left Sidebar Items (x ~ 10-18)
        if "engrenagem" in text:
            x, y = 18, 15
        elif "armazenamento" in text:
            x, y = 10, 22
        elif "caixa de entrada" in text and "pasta" in text:
            x, y = 10, 28
        elif "rascunhos" in text and "pasta" in text:
            x, y = 10, 32
        elif "enviados" in text and "pasta" in text:
            x, y = 10, 36
        elif "lixeira" in text and "pasta" in text:
            x, y = 10, 40
        elif "lixo eletrônico" in text and "pasta" in text:
            x, y = 10, 44
        elif "modelos" in text and "pasta" in text:
            x, y = 10, 48
        elif "archive" in text and "pasta" in text:
            x, y = 10, 52
            
        # Middle Column (x ~ 20-35)
        elif "lupa" in text:
            x, y = 25, 16
        elif "atualização" in text or "seta circular" in text:
            x, y = 32, 16
        elif "lista de mensagens" in text:
            x, y = 28, 50
            
        # Right Column (x ~ 40-95)
        elif "painel de leitura" in text or "nenhuma mensagem selecionada" in text:
            x, y = 65, 50
            
        # Global buttons
        elif "botão verde" in text and "escrever" in text:
            x, y = 32, 92
        elif "desconectar" in text:
            x, y = 72, 5
        elif "preferências avançadas" in text or "chave inglesa" in text:
            x, y = 69, 5
        elif "calendário" in text and "atalhos" in text:
            x, y = 60, 5
        elif "catálogo de endereços" in text and "atalhos" in text:
            x, y = 63, 5

    # == COMPOSE WINDOW ==
    elif "07.50.33" in img:
        if "remetente" in text:
            x, y = 45, 17
        elif "para" in text and "campo" in text:
            x, y = 45, 22
        elif "cc" in text and "cópia" in text:
            x, y = 45, 27
        elif "bcc" in text:
            x, y = 45, 32
        elif "assunto" in text:
            x, y = 45, 37
        elif "corpo da mensagem" in text:
            x, y = 50, 60
        elif "formatação" in text:
            x, y = 45, 42
        elif "código-fonte" in text:
            x, y = 70, 42
        elif "clipe" in text or "anexar" in text:
            x, y = 85, 95
        elif "enviar" in text and "seta" in text:
            x, y = 25, 10
        elif "disquete" in text or "salvar" in text:
            x, y = 28, 10
        elif "fechar" in text or "x" in text:
            x, y = 98, 10

    # == PREFERENCES ==
    elif "07.51.48" in img:  # Geral
        if "idioma" in text: x, y = 40, 30
        elif "fuso horário" in text: x, y = 40, 35
        elif "formatos" in text: x, y = 40, 40
        elif "módulo padrão" in text: x, y = 40, 50
        elif "salvar" in text: x, y = 95, 15

    # == CALENDAR ==
    elif "08.02.17" in img:
        if "calendário pessoal" in text: x, y = 10, 20
        elif "eventos" in text: x, y = 25, 15
        elif "tarefas" in text: x, y = 35, 15
        elif "botão verde" in text: x, y = 15, 92
        elif "hoje" in text: x, y = 28, 22

    # Global matching for missing things
    else:
        if "salvar" in text and "botão" in text: x, y = 95, 15
        elif "desconectar" in text: x, y = 95, 10

    # Small jitter so they don't look completely frozen
    jitter_x = (len(text) % 3) - 1
    jitter_y = (len(text) % 3) - 1
    
    if x == 50 and y == 50:
        x += (len(text) % 20) - 10
        y += (len(text) % 30) - 15

    step["x"] = max(5, min(95, x + jitter_x))
    step["y"] = max(5, min(95, y + jitter_y))

js_content = f"const lessonData = {json.dumps(data, indent=2, ensure_ascii=False)};"
with open(filepath, "w", encoding="utf-8") as f:
    f.write(js_content)

print("Updated coordinates with High Precision!")
