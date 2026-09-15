"use client";

import { useState } from "react";
import TabFinanziamento, {
  type ConfigFinanziamentoRow,
  type ConvenzioneRow,
} from "@/components/admin-parametri/TabFinanziamento";
import TabGriglie, {
  type GrigliaAdmin,
} from "@/components/admin-parametri/TabGriglie";
import TabPosa from "@/components/admin-parametri/TabPosa";
import TabProdotti, {
  type ProdottoAdmin,
} from "@/components/admin-parametri/TabProdotti";
import TabServizi, {
  type ServizioDefault,
} from "@/components/admin-parametri/TabServizi";
import TabTendine, {
  type OpzioneLista,
} from "@/components/admin-parametri/TabTendine";

const TABS = [
  { id: "prodotti", label: "Prodotti" },
  { id: "griglie", label: "Griglie" },
  { id: "finanziamento", label: "Finanziamento" },
  { id: "tendine", label: "Tendine" },
  { id: "servizi", label: "Servizi" },
  { id: "posa", label: "Posa" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Props = {
  prodotti: ProdottoAdmin[];
  griglie: GrigliaAdmin[];
  griglieTableMissing: boolean;
  configFinanziamento: ConfigFinanziamentoRow[];
  convenzioni: ConvenzioneRow[];
  colori: OpzioneLista[];
  vetri: OpzioneLista[];
  serviziDefault: ServizioDefault[];
  serviziTableMissing: boolean;
  descrizionePosa: string;
  posaTableMissing: boolean;
};

export default function AdminParametriClient(props: Props) {
  const [tab, setTab] = useState<TabId>("prodotti");

  return (
    <div className="space-y-6">
      <div
        className="flex flex-wrap gap-1 border-b border-brand-border"
        role="tablist"
        aria-label="Sezioni parametri"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={[
                "min-h-[44px] rounded-t-md px-4 text-sm font-medium transition-colors",
                active
                  ? "border border-b-white border-brand-border bg-white text-brand-navy"
                  : "border border-transparent text-brand-muted hover:text-brand-navy",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="rounded-b-lg">
        {tab === "prodotti" && (
          <TabProdotti initialProdotti={props.prodotti} />
        )}
        {tab === "griglie" && (
          <TabGriglie
            initialGriglie={props.griglie}
            tableMissing={props.griglieTableMissing}
          />
        )}
        {tab === "finanziamento" && (
          <TabFinanziamento
            initialConfig={props.configFinanziamento}
            initialConvenzioni={props.convenzioni}
          />
        )}
        {tab === "tendine" && (
          <TabTendine
            initialColori={props.colori}
            initialVetri={props.vetri}
          />
        )}
        {tab === "servizi" && (
          <TabServizi
            initialServizi={props.serviziDefault}
            tableMissing={props.serviziTableMissing}
          />
        )}
        {tab === "posa" && (
          <TabPosa
            initialDescrizione={props.descrizionePosa}
            tableMissing={props.posaTableMissing}
          />
        )}
      </div>
    </div>
  );
}
