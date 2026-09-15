"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AutosaveStatusIndicator from "@/components/AutosaveStatusIndicator";
import { Button, Card, Input } from "@/components/ui";
import { useAutosaveController } from "@/hooks/useAutosave";
import { createSupabaseClient } from "@/lib/supabase";

export type OpzioneLista = {
  id: number;
  valore: string;
  ordine: number;
};

type Props = {
  initialColori: OpzioneLista[];
  initialVetri: OpzioneLista[];
};

export default function TabTendine({
  initialColori,
  initialVetri,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ListaOpzioni
        titolo="Colori"
        tabella="opzioni_colore"
        initial={initialColori}
      />
      <ListaOpzioni
        titolo="Vetri"
        tabella="opzioni_vetro"
        initial={initialVetri}
      />
    </div>
  );
}

function ListaOpzioni({
  titolo,
  tabella,
  initial,
}: {
  titolo: string;
  tabella: "opzioni_colore" | "opzioni_vetro";
  initial: OpzioneLista[];
}) {
  const [items, setItems] = useState(
    [...initial].sort((a, b) => a.ordine - b.ordine || a.id - b.id),
  );
  const [nuovo, setNuovo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const autosave = useAutosaveController();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function persistiOrdine(next: OpzioneLista[]) {
    const supabase = createSupabaseClient();
    const updates = next.map((item, index) =>
      supabase
        .from(tabella)
        .update({ ordine: (index + 1) * 10 })
        .eq("id", item.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    setItems(
      next.map((item, index) => ({ ...item, ordine: (index + 1) * 10 })),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    void autosave.run(async () => {
      setError(null);
      try {
        await persistiOrdine(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore riordino");
        throw err;
      }
    });
  }

  async function aggiungi() {
    const valore = nuovo.trim();
    if (!valore) return;
    setAdding(true);
    setError(null);
    try {
      const ordine =
        items.reduce((max, i) => Math.max(max, i.ordine ?? 0), 0) + 10;
      const supabase = createSupabaseClient();
      const { data, error: insertError } = await supabase
        .from(tabella)
        .insert({ valore, ordine })
        .select("id, valore, ordine")
        .single();
      if (insertError || !data) {
        throw new Error(insertError?.message ?? "Inserimento fallito");
      }
      setItems((prev) => [...prev, data as OpzioneLista]);
      setNuovo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setAdding(false);
    }
  }

  async function elimina(id: number) {
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { error: deleteError } = await supabase
        .from(tabella)
        .delete()
        .eq("id", id);
      if (deleteError) throw new Error(deleteError.message);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-brand-navy">{titolo}</h3>
        <AutosaveStatusIndicator
          status={autosave.status}
          onRetry={autosave.retry}
        />
      </div>

      <div className="mb-3 flex gap-2">
        <Input
          label={`Nuovo ${titolo.toLowerCase().slice(0, -1)}`}
          value={nuovo}
          onChange={(e) => setNuovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void aggiungi();
            }
          }}
          wrapperClassName="flex-1"
        />
        <Button
          type="button"
          variant="primary"
          className="mt-6"
          disabled={adding || !nuovo.trim()}
          onClick={() => void aggiungi()}
        >
          Aggiungi
        </Button>
      </div>

      {error && (
        <p className="mb-2 text-sm text-brand-danger" role="alert">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {items.map((item) => (
              <SortableRiga
                key={item.id}
                item={item}
                onDelete={() => void elimina(item.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="mt-3 text-sm text-brand-muted">Nessuna opzione.</p>
      )}
    </Card>
  );
}

function SortableRiga({
  item,
  onDelete,
}: {
  item: OpzioneLista;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={[
        "flex items-center gap-2 rounded-md border border-brand-border bg-white px-2 py-2",
        isDragging ? "opacity-70 shadow" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className="cursor-grab px-1 text-brand-muted active:cursor-grabbing"
        aria-label="Trascina per riordinare"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-brand-text">
        {item.valore}
      </span>
      <Button
        type="button"
        variant="danger"
        className="min-h-[32px] px-2 py-1 text-xs"
        onClick={onDelete}
      >
        Elimina
      </Button>
    </li>
  );
}
