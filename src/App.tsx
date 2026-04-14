import { WebsiteBackground } from "./components/WebsiteBackground";

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#00152b] text-slate-200">
      <WebsiteBackground duckSrc="/duck.png" />
      <main className="relative z-10 p-8">
        <h1 className="text-4xl font-bold">Mijn pagina met dezelfde achtergrond</h1>
      </main>
    </div>
  );
}
