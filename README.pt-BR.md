[English](README.md) · [Português (BR)](README.pt-BR.md) · [Español](README.es.md)

# Barca

Cliente FTP, FTPS e SFTP moderno para macOS (Apple Silicon), Windows e Linux.

Gerenciador de arquivos em dois painéis (local ⇄ servidor), fila de
transferências, gerenciador de sites e log de operações — feito com Electron,
Node.js e HTML5/CSS/JavaScript puro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="Barca conectada a um site salvo por SFTP, com envios em andamento" src="docs/screenshot-light.png">
</picture>

## Recursos

- **Protocolos:** SFTP (senha ou chave privada), FTPS (explícito e implícito) e FTP
- **Dois painéis:** colunas ordenáveis, seleção múltipla (⌘ ou Ctrl, ⇧), navegação por teclado, caminho editável
- **Arrastar e soltar:** entre os painéis ou do Finder ou Explorador de Arquivos direto para o servidor
- **Fila de transferências:** 2 conexões em paralelo, pastas recursivas, progresso e
  velocidade, cancelar, repetir, sobrescrever ou pular arquivos existentes
- **Operações remotas:** nova pasta, renomear, excluir, permissões (chmod), copiar caminho
- **Gerenciador de sites:** senhas criptografadas pelo cofre do sistema (Keychain do macOS, DPAPI do Windows, GNOME Keyring ou KWallet)
- **Segurança:** confirmação da impressão digital da chave SSH e alerta de mudança;
  aviso ao usar FTP sem criptografia
- Tema claro/escuro automático

## Download

Baixe a versão mais recente na página de [Releases](https://github.com/RogerPhilippe/Barca/releases):

| Sistema | Arquivo |
|---|---|
| macOS (Apple Silicon) | `Barca-<versão>-macos-arm64.zip` |
| Windows x64 | `Barca-<versão>-windows-x64.zip` |
| Linux x64 | `Barca-<versão>-linux-x64.tar.gz` |

Os builds não são assinados pela Apple nem pela Microsoft, então o sistema
mostra um aviso na primeira abertura. As notas do release explicam como
liberar em cada sistema.

## Rodando localmente

Requisitos: Node.js 20+

```bash
npm install
npx install-electron   # baixa o binário do Electron (o npm 12+ bloqueia scripts de instalação)
npm start
```

## Gerando o app

```bash
npm run icon        # gera os ícones a partir de build/icon.svg (requer macOS)
npm run dist        # gera macOS arm64, Windows x64 e Linux x64 em dist/
npm run dist:mac    # ou uma plataforma só: dist:mac, dist:win, dist:linux
```

O app do macOS recebe assinatura ad-hoc. Para distribuir sem avisos do
Gatekeeper ou do SmartScreen, assine com um Developer ID (macOS) ou um
certificado de assinatura de código (Windows).

## Estrutura do projeto

```
src/main/       processo principal (Node.js)
  main.js       janela, IPC, verificação de chaves de servidor
  remote.js     cliente unificado FTP/FTPS/SFTP
  queue.js      fila de transferências
  store.js      sites salvos e chaves SSH confiáveis
  preload.js    ponte segura entre o processo principal e a interface
src/renderer/   interface (HTML5, CSS, JavaScript)
```

## Stack

Electron · Node.js · [basic-ftp](https://github.com/patrickjuchli/basic-ftp) ·
[ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) · HTML5 · CSS · JavaScript

## Licença

A Barca é distribuída sob **dupla licença**:

- [AGPLv3](LICENSE) — gratuita, desde que qualquer versão modificada (incluindo
  uso como serviço em rede) também seja disponibilizada sob a mesma licença.
- [Licença comercial](COMMERCIAL-LICENSE.pt-BR.md) — uma garantia, não um
  produto: vender a Barca ou usá-la em software de código fechado exige
  autorização expressa do mantenedor.

Contribuições estão sujeitas aos termos em [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md).

As dependências de terceiros mantêm suas próprias licenças (MIT, Apache-2.0,
BSD-3-Clause, ISC, Unlicense), todas compatíveis com as duas opções de licença.

Copyright © 2026 Roger Philippe Pereira
