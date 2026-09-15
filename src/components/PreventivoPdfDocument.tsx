import type { ReactNode } from "react";
import { parseDescrizioneFormattata } from "@/lib/descrizione-formattata";
import { formatEuro, formatDataDocumento } from "@/lib/format";
import { formatTelefonoPdf } from "@/lib/pdf-link";
import { round2 } from "@/lib/totali-preventivo";
import {
  etichettaImportoServizio,
  etichettaNotaServizio,
} from "@/lib/servizi-nota";

function formatPercentualeSconto(n: number): string {
  return `${round2(n).toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

type SedePdf = {
  nome: string;
  indirizzo: string | null;
  cap: string | null;
  telefono: string | null;
  email: string | null;
  orari: string | null;
};

type CommercialePdf = {
  nome: string;
  telefono: string | null;
  email: string | null;
  riferimento_aziendale: string | null;
};

type RigaPdf = {
  key: string;
  tipo_riga: "prodotto" | "testo" | "posa";
  quantita: number;
  quantitaEtichetta?: string;
  descrizione: string;
  testo_libero: string;
  nota: string;
  prezzo_riga: number | null;
  importo_display: number | null;
  importoEtichetta?: string;
};

type ServizioPdf = {
  descrizione: string;
  nota: string;
  importo: number;
};

type PreventivoPdfDocumentProps = {
  riferimento: string;
  clienteNome: string;
  clienteCantiere: string;
  clienteTelefono: string;
  clienteEmail: string;
  numeroPreventivo: string;
  dataPreventivo: string;
  revisione: string;
  validitaGiorni: string;
  commerciale: CommercialePdf | null;
  sede: SedePdf | null;
  righe: RigaPdf[];
  importoTotale: number;
  scontoPercentuale: number;
  scontoPercentuale2: number;
  importoSconto1: number;
  importoSconto2: number;
  importoScontato: number;
  servizi: ServizioPdf[];
  totaleServizi: number;
  totaleFinale: number;
  ivaPercentuale: number;
  importoIva: number;
  totaleIvato: number;
  notePreventivo: string;
};

/** Palette brand — colori espliciti hex per compatibilità html2canvas-pro */
const BRAND = {
  navy: "#1C3D5A",
  accent: "#0093B8",
  gold: "#F2C200",
  text: "#222222",
  textMuted: "#5A6470",
  white: "#FFFFFF",
  rowAlt: "#F7F8FA",
  border: "#D8DEE6",
} as const;

const avoidBreak = {
  pageBreakInside: "avoid" as const,
  breakInside: "avoid" as const,
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: "0 0 10px",
        fontSize: 13,
        fontWeight: 700,
        color: BRAND.navy,
        letterSpacing: "0.02em",
        borderBottom: `2px solid ${BRAND.accent}`,
        paddingBottom: 4,
        display: "inline-block",
        minWidth: 120,
      }}
    >
      {children}
    </h2>
  );
}

function DescrizioneFormattataPdf({ text }: { text: string }) {
  const { lines } = parseDescrizioneFormattata(text);
  if (!text.trim()) return <>—</>;

  return (
    <div style={{ textAlign: "left" }}>
      {lines.map((segs, lineIndex) => {
        const plain = segs.map((s) => s.text).join("");
        return (
          <div
            key={lineIndex}
            style={{
              minHeight: plain === "" ? "1em" : undefined,
              whiteSpace: "pre-wrap",
            }}
          >
            {segs.map((seg, segIndex) =>
              seg.text ? (
                <span
                  key={segIndex}
                  style={seg.red ? { color: "#c81e1e", fontWeight: 600 } : undefined}
                >
                  {seg.text}
                </span>
              ) : null,
            )}
            {plain === "" ? "\u00a0" : null}
          </div>
        );
      })}
    </div>
  );
}

function TableHead({ columns }: { columns: { label: string; align?: "right" }[] }) {
  return (
    <thead>
      <tr style={{ backgroundColor: BRAND.navy }}>
        {columns.map((col) => (
          <th
            key={col.label}
            style={{
              padding: "8px 10px",
              fontWeight: 700,
              fontSize: 11,
              color: BRAND.white,
              textAlign: col.align ?? "left",
              borderBottom: `2px solid ${BRAND.accent}`,
            }}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ marginBottom: 4, lineHeight: 1.5 }}>
      <span style={{ color: BRAND.textMuted, fontSize: 10 }}>{label}: </span>
      <span style={{ color: BRAND.text }}>{value}</span>
    </div>
  );
}

export default function PreventivoPdfDocument({
  riferimento,
  clienteNome,
  clienteCantiere,
  clienteTelefono,
  clienteEmail,
  numeroPreventivo,
  dataPreventivo,
  revisione,
  validitaGiorni,
  commerciale,
  sede,
  righe,
  importoTotale,
  scontoPercentuale,
  scontoPercentuale2,
  importoSconto1,
  importoSconto2,
  importoScontato,
  servizi,
  totaleServizi,
  totaleFinale,
  ivaPercentuale,
  importoIva,
  totaleIvato,
  notePreventivo,
}: PreventivoPdfDocumentProps) {
  let productRowIndex = 0;

  return (
    <div
      className="pdf-document"
      style={{
        color: BRAND.text,
        backgroundColor: BRAND.white,
        fontSize: 11,
        lineHeight: 1.45,
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: "4px 0",
      }}
    >
      {/* Fascia loghi */}
      <div
        style={{
          height: 64,
          marginBottom: 20,
          border: `1px solid ${BRAND.border}`,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-evenly",
          gap: 24,
          padding: "10px 16px",
          backgroundColor: BRAND.white,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pdf-template/logo.png"
          alt="Bruno Drago"
          style={{ height: 44, width: "auto", objectFit: "contain" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pdf-template/logo-iwg.png"
          alt="IWG"
          style={{ height: 38, width: "auto", objectFit: "contain" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pdf-template/logo-posaclima.png"
          alt="PosaClima"
          style={{ height: 38, width: "auto", objectFit: "contain" }}
        />
      </div>

      <header
        style={{
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: `1px solid ${BRAND.border}`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            border: `1px solid ${BRAND.border}`,
            backgroundColor: BRAND.rowAlt,
            padding: 12,
          }}
        >
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: BRAND.navy, letterSpacing: "0.08em" }}>
              CLIENTE
            </p>
            <InfoRow label="RIF. CLIENTE" value={riferimento} />
            <InfoRow label="Nome" value={clienteNome || "—"} />
            <InfoRow label="cantiere di" value={clienteCantiere || "—"} />
            <InfoRow
              label="Telefono Cliente"
              value={
                clienteTelefono
                  ? formatTelefonoPdf(clienteTelefono)
                  : "—"
              }
            />
          </div>

          <div>
            <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, color: BRAND.navy, letterSpacing: "0.08em" }}>
              OFFERTA
            </p>
            <InfoRow label="Data" value={formatDataDocumento(dataPreventivo)} />
            <InfoRow label="Offerta n." value={numeroPreventivo || "—"} />
            <InfoRow label="Revisione numero" value={revisione || "0"} />
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            border: `1px solid ${BRAND.border}`,
            padding: "8px 12px",
            fontSize: 10,
          }}
        >
          <span style={{ color: BRAND.textMuted }}>
            {sede?.nome?.trim()
              ? `Sede di ${sede.nome.trim()}${
                  sede.indirizzo?.trim() ? `, ${sede.indirizzo.trim()}` : ""
                }`
              : ""}
          </span>
          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontWeight: 700,
                color: BRAND.navy,
                letterSpacing: "0.04em",
                display: "block",
              }}
            >
              RIFERIMENTO AZIENDALE
            </span>
            {commerciale?.riferimento_aziendale?.trim() ? (
              <span style={{ color: BRAND.text, display: "block", marginTop: 2 }}>
                {commerciale.riferimento_aziendale.trim()}
              </span>
            ) : null}
          </div>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: `1px solid ${BRAND.border}`,
            marginTop: 8,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: BRAND.navy }}>
              <th
                style={{
                  padding: "6px 10px",
                  color: BRAND.white,
                  fontWeight: 700,
                  fontSize: 10,
                  textAlign: "left",
                }}
              >
                CONSULENTE TECNICO
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  color: BRAND.white,
                  fontWeight: 700,
                  fontSize: 10,
                  textAlign: "left",
                }}
              >
                CONTATTI CONSULENTE
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  color: BRAND.white,
                  fontWeight: 700,
                  fontSize: 10,
                  textAlign: "left",
                }}
              >
                CONSEGNA
              </th>
              <th
                style={{
                  padding: "6px 10px",
                  color: BRAND.white,
                  fontWeight: 700,
                  fontSize: 10,
                  textAlign: "left",
                }}
              >
                VALIDITA&apos; OFFERTA
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
              <td
                style={{
                  padding: "8px 10px",
                  fontWeight: 700,
                  color: BRAND.navy,
                  fontSize: 11,
                }}
              >
                {commerciale?.nome ?? ""}
              </td>
              <td style={{ padding: "8px 10px", fontSize: 10, color: BRAND.text }}>
                {[
                  commerciale?.telefono
                    ? formatTelefonoPdf(commerciale.telefono)
                    : null,
                  commerciale?.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </td>
              <td style={{ padding: "8px 10px", fontSize: 10, color: BRAND.text }}>
                VEDASI DIETRO
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: BRAND.text,
                }}
              >
                {validitaGiorni || "30"} GIORNI
              </td>
            </tr>
          </tbody>
        </table>
      </header>

      <section style={{ marginBottom: 28 }}>
        <div style={{
          backgroundColor: BRAND.navy,
          color: BRAND.white,
          textAlign: "center",
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginBottom: 0,
        }}>
          La nostra migliore offerta per il tuo progetto
        </div>
        {righe.length === 0 ? (
          <p style={{ margin: 0, color: BRAND.textMuted }}>
            Nessuna riga nel preventivo.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: `1px solid ${BRAND.border}`,
            }}
          >
            <TableHead
              columns={[
                { label: "Q.TA" },
                { label: "DESCRIZIONE" },
                { label: "NOTE/CARATTERISTICHE" },
                { label: "IMPORTO", align: "right" },
              ]}
            />
            <tbody>
              {righe.map((riga) => {
                if (riga.tipo_riga === "testo") {
                  return (
                    <tr
                      key={riga.key}
                      className="pdf-row"
                      style={{
                        ...avoidBreak,
                        backgroundColor: BRAND.rowAlt,
                        borderTop: `1px solid ${BRAND.border}`,
                      }}
                    >
                      <td
                        colSpan={4}
                        style={{
                          padding: "10px 12px",
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: BRAND.navy,
                          borderLeft: `4px solid ${BRAND.accent}`,
                        }}
                      >
                        {riga.testo_libero || "—"}
                      </td>
                    </tr>
                  );
                }

                const isAlt = productRowIndex % 2 === 1;
                productRowIndex += 1;

                return (
                  <tr
                    key={riga.key}
                    className="pdf-row"
                    style={{
                      ...avoidBreak,
                      backgroundColor: isAlt ? BRAND.rowAlt : BRAND.white,
                      borderBottom: `1px solid ${BRAND.border}`,
                    }}
                  >
                    <td
                      style={{
                        width: 48,
                        padding: "8px 10px",
                        verticalAlign: "top",
                        fontWeight: 600,
                        color: BRAND.navy,
                      }}
                    >
                      {riga.quantitaEtichetta ?? riga.quantita}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        verticalAlign: "top",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <DescrizioneFormattataPdf
                        text={riga.descrizione || ""}
                      />
                    </td>
                    <td
                      style={{
                        width: 150,
                        padding: "8px 10px",
                        verticalAlign: "top",
                        whiteSpace: "pre-wrap",
                        color: BRAND.textMuted,
                        fontSize: 10,
                      }}
                    >
                      {riga.tipo_riga === "posa" ? (
                        <div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/pdf-template/logo-posaclima.png"
                            alt="PosaClima"
                            style={{
                              display: "block",
                              width: 92,
                              height: "auto",
                              marginBottom: riga.nota?.trim() ? 6 : 0,
                            }}
                          />
                          {riga.nota?.trim() ? riga.nota : null}
                        </div>
                      ) : (
                        riga.nota || "—"
                      )}
                    </td>
                    <td
                      style={{
                        width: 96,
                        padding: "8px 10px",
                        verticalAlign: "top",
                        textAlign: "right",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        color: BRAND.navy,
                      }}
                    >
                      {riga.importoEtichetta
                        ? riga.importoEtichetta
                        : riga.importo_display != null
                          ? formatEuro(riga.importo_display)
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section
        style={{
          ...avoidBreak,
          marginBottom: 28,
          marginLeft: "auto",
          maxWidth: 300,
          padding: "12px 14px",
          border: `1px solid ${BRAND.border}`,
          backgroundColor: BRAND.rowAlt,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span style={{ color: BRAND.textMuted }}>IMPORTO iva di legge esclusa</span>
          <span style={{ fontWeight: 600, color: BRAND.text }}>
            {formatEuro(importoTotale)}
          </span>
        </div>
        {(scontoPercentuale > 0 || scontoPercentuale2 > 0) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span style={{ color: BRAND.textMuted }}>
              Scontistica a Voi riservata
            </span>
            <span style={{ fontWeight: 600, color: BRAND.accent }}>
              {scontoPercentuale2 > 0
                ? `${formatPercentualeSconto(scontoPercentuale)} + ${formatPercentualeSconto(scontoPercentuale2)}`
                : formatPercentualeSconto(scontoPercentuale)}
            </span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 8,
            marginTop: 4,
            borderTop: `2px solid ${BRAND.accent}`,
          }}
        >
          <span style={{ fontWeight: 600, color: BRAND.navy }}>
            Importo scontato
          </span>
          <span style={{ fontWeight: 700, color: BRAND.navy }}>
            {formatEuro(importoScontato)}
          </span>
        </div>
      </section>

      {servizi.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionTitle>Servizi complementari</SectionTitle>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: `1px solid ${BRAND.border}`,
            }}
          >
            <TableHead
              columns={[
                { label: "Descrizione" },
                { label: "Nota" },
                { label: "Importo", align: "right" },
              ]}
            />
            <tbody>
              {servizi.map((servizio, index) => (
                <tr
                  key={`${servizio.descrizione}-${index}`}
                  className="pdf-row"
                  style={{
                    ...avoidBreak,
                    backgroundColor:
                      index % 2 === 1 ? BRAND.rowAlt : BRAND.white,
                    borderBottom: `1px solid ${BRAND.border}`,
                  }}
                >
                  <td style={{ padding: "8px 10px" }}>
                    {servizio.descrizione || "—"}
                  </td>
                  <td
                    style={{
                      width: 112,
                      padding: "8px 10px",
                      color: BRAND.textMuted,
                      fontSize: 10,
                    }}
                  >
                    {etichettaNotaServizio(servizio.nota)}
                  </td>
                  <td
                    style={{
                      width: 96,
                      padding: "8px 10px",
                      textAlign: "right",
                      fontWeight: 700,
                      color: BRAND.navy,
                    }}
                  >
                    {etichettaImportoServizio(servizio.importo, servizio.nota)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {notePreventivo.trim() && (
        <section style={{ ...avoidBreak, marginBottom: 28 }}>
          <SectionTitle>Note preventivo</SectionTitle>
          <p
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              padding: "10px 14px",
              border: `1px solid ${BRAND.border}`,
              borderLeft: `4px solid ${BRAND.accent}`,
              backgroundColor: BRAND.rowAlt,
              color: BRAND.text,
            }}
          >
            {notePreventivo}
          </p>
        </section>
      )}

      <section
        style={{
          ...avoidBreak,
          backgroundColor: BRAND.gold,
          border: `2px solid ${BRAND.navy}`,
          borderRadius: 4,
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: BRAND.navy,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            IMPORTO TOTALE LAVORI CHIAVI IN MANO - iva di legge esclusa
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: BRAND.navy,
            }}
          >
            {formatEuro(totaleFinale)}
          </span>
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 10,
            color: BRAND.text,
            opacity: 0.85,
          }}
        >
          Importo scontato ({formatEuro(importoScontato)}) + servizi (
          {formatEuro(totaleServizi)})
        </p>
      </section>

      <section
        style={{
          ...avoidBreak,
          marginTop: 12,
          padding: "14px 20px",
          border: `1px solid ${BRAND.border}`,
          backgroundColor: BRAND.rowAlt,
          borderRadius: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={{ color: BRAND.textMuted, fontSize: 12 }}>
            IVA {ivaPercentuale}%
          </span>
          <span style={{ fontWeight: 600, fontSize: 12 }}>
            {formatEuro(importoIva)}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 10,
            borderTop: `2px solid ${BRAND.navy}`,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: BRAND.navy,
              textTransform: "uppercase",
            }}
          >
            Totale IVA inclusa
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: BRAND.navy,
            }}
          >
            {formatEuro(totaleIvato)}
          </span>
        </div>
      </section>
    </div>
  );
}
