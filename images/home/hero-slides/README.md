# Hero slides (index.html)

Uma foto = um slide. Markup em `index.html` (`<section class="hx">`), estilos em `css/hero.css`, lógica em `js/hero.js`.

## Especificações da foto
- **Formato:** 1920×1080 (16:9), .webp
- **Fundo:** escuro/preto — o texto é branco por cima
- **Composição:** produto de um lado, espaço vazio do outro (onde entra o texto)
- **Compressão:** `cwebp -q 90 -m 6 -sharp_yuv original.png -o nome.webp` (fica ~70–140 KB)
- **Nome:** `nome-do-produto.webp`

## Ajustes por slide (no `<article class="hx-slide">`)
| Atributo | Valores | O que faz |
|---|---|---|
| `data-layout` | `split` / `left` / `right` | onde fica o texto no desktop |
| `data-anchor` | `left` | desktop: prende a foto na esquerda, corta só a direita |
| `data-duration` | ms (padrão 7000) | tempo do slide |
| `--cx-m` | 0–1 | celular: centro horizontal do produto na foto |
| `--zoom-d` | número (padrão 1) | desktop: zoom extra |
| `--zx` / `--zy` | 0–1 | desktop: ponto do produto de onde o zoom cresce |

## Slides atuais
| Arquivo | Produto em | Layout | Ajustes |
|---|---|---|---|
| easy-glow-black-white.webp | centro | split (Raven Black / Ghost White) | `--cx-m: .5` · 9 s |
| inkcap.webp | esquerda | right + anchor left | `--cx-m: .17; --zoom-d: 1.25; --zx: .1; --zy: .55` · 7 s |
