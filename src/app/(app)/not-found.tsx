import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-display font-semibold text-6xl text-brand">404</p>
      <p className="mt-4 text-muted">Página não encontrada ou sem permissão de acesso.</p>
      <LinkButton href="/dashboard" variant="outline" className="mt-8">Voltar ao início</LinkButton>
    </div>
  );
}
