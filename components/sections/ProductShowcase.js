"use client";

import Sidebar from "@/components/Sidebar";
import Workspace from "@/components/Workspace";
import SectionIntro from "@/components/ui/SectionIntro";
import Section from "@/components/layouts/Section";
import { SHOWCASE } from "@/lib/landing-content";

const noop = () => {};

// Live preview of the real Hosptic Provider workspace. It reuses the same Sidebar and Workspace
// components as the app, rendered read-only with an example analysis from the demo engine.
export default function ProductShowcase({ conversation, datasets, conversations }) {
  return (
    <Section id="product" tone="surface" labelledBy="product-title">
      <SectionIntro id="product-title" eyebrow={SHOWCASE.eyebrow} title={SHOWCASE.title} description={SHOWCASE.description} />

      <figure className="mt-12 sm:mt-14">
        <div className="showcase-frame overflow-hidden rounded-2xl border border-line bg-canvas shadow-showcase">
          <div className="flex h-11 items-center gap-2 border-b border-line bg-surface px-4" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="ml-3 text-xs font-semibold text-muted">Hosptic Provider</span>
          </div>

          <div className="showcase-body" inert>
            <div className="shell">
              <Sidebar
                view="chat"
                collapsed={false}
                onToggleCollapse={noop}
                onNavigate={noop}
                onNew={noop}
                conversations={conversations}
                activeId={conversation.id}
                onOpenConversation={noop}
                counts={{ conversations: conversations.length, reports: 2, datasets: datasets.length }}
                onCloseDrawer={noop}
              />
              <main className="main">
                <div className="topbar">
                  <div className="topbar-title">{conversation.title}</div>
                </div>
                <Workspace
                  conversation={conversation}
                  datasets={datasets}
                  selectedDatasets={conversation.datasetIds}
                  onDatasetsChange={noop}
                  onAsk={noop}
                  pending={null}
                  error={null}
                  onRetry={noop}
                  onRename={noop}
                  onDelete={noop}
                  onOpenReport={noop}
                  onDownloadReport={noop}
                  ready
                  preview
                />
              </main>
            </div>
          </div>
        </div>
        <figcaption className="mt-4 text-center text-sm text-muted">{SHOWCASE.caption}</figcaption>
      </figure>
    </Section>
  );
}
