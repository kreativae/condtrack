import { MARK_CHECK, MARK_FLOORS } from "./logo";

/** Uma vez por sessão do navegador (fechar o app e abrir de novo mostra outra vez). */
const SEEN_KEY = "condtrack_splash";

/**
 * Tela de abertura (celular e app instalado): os andares sobem, o traço de conferido se desenha e o nome aparece;
 * some sozinha em ~1,6 s (toque pula). Feita em HTML/CSS servidos com a página, sem esperar o React: aparece antes
 * do primeiro desenho e o script logo abaixo a desliga se já foi vista nesta sessão ou se a tela é de computador.
 * `suppressHydrationWarning`: o script muda o atributo antes da hidratação. Estilos em globals.css (`.splash`).
 */
export function SplashScreen() {
  const script = `(function(){var s=document.getElementById("splash");if(!s)return;try{var big=!matchMedia("(max-width: 1023px), (display-mode: standalone)").matches;if(big||location.pathname==="/"||sessionStorage.getItem("${SEEN_KEY}")){s.setAttribute("data-off","");return}sessionStorage.setItem("${SEEN_KEY}","1")}catch(e){}s.addEventListener("click",function(){s.setAttribute("data-off","")});s.addEventListener("animationend",function(e){if(e.target===s)s.setAttribute("data-off","")})})();`;
  return (
    <>
      <div id="splash" className="splash" aria-hidden suppressHydrationWarning>
        <div className="splash-grid" />
        <div className="splash-center">
          <svg viewBox="0 0 64 64" width="112" height="112">
            <rect width="64" height="64" rx="18" fill="rgb(255 255 255 / 0.08)" />
            <rect x="0.5" y="0.5" width="63" height="63" rx="17.5" fill="none" stroke="rgb(255 255 255 / 0.18)" />
            <g transform="translate(0 2.2)">
              {MARK_FLOORS.map((f, i) => (
                <rect key={f.y} className="splash-floor" style={{ animationDelay: `${0.1 + i * 0.14}s` }} x={f.x} y={f.y} width={f.w} height={9} rx={4.5} fill="#fff" />
              ))}
              <path className="splash-check" d={MARK_CHECK} fill="none" stroke="var(--mark-accent)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
          <p className="splash-word font-brand">
            cond<span>track</span>
          </p>
          <p className="splash-tag">Gestão condominial</p>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
