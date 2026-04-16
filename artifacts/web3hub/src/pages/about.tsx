import { useLang } from "@/lib/i18n";
import { ABOUT_CONTENT, type AboutSection } from "@/lib/about-content";
import { Info, ChevronRight } from "lucide-react";
import { Link } from "wouter";

function SectionBlock({ section }: { section: AboutSection }) {
  return (
    <div className="mb-8">
      <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-blue-500 inline-block shrink-0" />
        {section.heading}
      </h2>
      {section.intro && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-3 pl-3">{section.intro}</p>
      )}
      {section.items && section.items.length > 0 && (
        <ul className="pl-3 space-y-2">
          {section.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground">
              <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      )}
      {section.subsections && section.subsections.map((sub, si) => (
        <div key={si} className="mt-4 pl-3">
          <h3 className="text-base font-bold text-foreground mb-2">{sub.heading}</h3>
          {sub.intro && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">{sub.intro}</p>
          )}
          {sub.items && sub.items.length > 0 && (
            <ul className="space-y-2">
              {sub.items.map((item, ii) => (
                <li key={ii} className="flex gap-2 text-sm text-muted-foreground">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AboutPage() {
  const { lang } = useLang();
  const content = ABOUT_CONTENT[lang] ?? ABOUT_CONTENT["en"];

  return (
    <div className="min-h-screen bg-[#EEF5FF] dark:bg-background pt-[108px] pb-32 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{content.title}</span>
        </div>

        {/* Header card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border/50 shadow-sm p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">{content.title}</h1>
              <p className="text-muted-foreground leading-relaxed text-sm">{content.subtitle}</p>
            </div>
          </div>

          {/* Core concept banner */}
          <div className="mt-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <p className="text-blue-700 dark:text-blue-300 text-sm leading-relaxed font-medium">
              {content.coreConcept}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border/50 shadow-sm p-6">
          {content.sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Web3 Release · 2026
        </p>
      </div>
    </div>
  );
}
