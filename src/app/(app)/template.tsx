import { ViewTransition } from "react";

/**
 * Troca de página com a View Transitions API do navegador: o template é recriado a cada navegação, então a página
 * que sai e a que entra viram um par de saída/entrada (`.page-out` / `.page-in` em globals.css). Atualizações da
 * mesma página (salvar um formulário, router.refresh) não animam. Sem suporte no navegador, a troca é a normal.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
