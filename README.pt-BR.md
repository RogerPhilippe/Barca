[English](README.md) · [Português (BR)](README.pt-BR.md) · [Español](README.es.md)

# Barca

Cliente FTP, FTPS e SFTP moderno para macOS, nativo para Apple Silicon.

Gerenciador de arquivos em dois painéis (local ⇄ servidor), fila de
transferências, gerenciador de sites e log de operações — feito com Electron,
Node.js e HTML5/CSS/JavaScript puro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="Barca conectada a um site salvo por SFTP, com envios em andamento" src="docs/screenshot-light.png">
</picture>

## Recursos

- **Protocolos:** SFTP (senha ou chave privada), FTPS (explícito e implícito) e FTP
- **Dois painéis:** colunas ordenáveis, seleção múltipla (⌘/⇧), navegação por teclado, caminho editável
- **Arrastar e soltar:** entre os painéis ou do Finder direto para o servidor
- **Fila de transferências:** 2 conexões em paralelo, pastas recursivas, progresso e
  velocidade, cancelar, repetir, sobrescrever ou pular arquivos existentes
- **Operações remotas:** nova pasta, renomear, excluir, permissões (chmod), copiar caminho
- **Gerenciador de sites:** senhas criptografadas com o Keychain do macOS (`safeStorage`)
- **Segurança:** confirmação da impressão digital da chave SSH e alerta de mudança;
  aviso ao usar FTP sem criptografia
- Tema claro/escuro automático

## Rodando localmente

Requisitos: macOS 12+, Node.js 20+

```bash
npm install
npx install-electron   # baixa o binário do Electron (o npm 12+ bloqueia scripts de instalação)
npm start
```

## Gerando o app

```bash
npm run icon   # gera build/icon.icns a partir de build/icon.svg
npm run dist   # gera dist/Barca-darwin-arm64/Barca.app
```

O app gerado tem assinatura ad-hoc. Para distribuir para outros Macs sem
avisos do Gatekeeper, assine com um Developer ID e faça a notarização.

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

## Aviso

A Barca é um projeto independente, escrito do zero. Não contém código-fonte
do FileZilla® e não é afiliado, endossado nem patrocinado pelo projeto
FileZilla ou por Tim Kosse. FileZilla é uma marca de seu respectivo titular.

Copyright © 2026 Roger Philippe Pereira
