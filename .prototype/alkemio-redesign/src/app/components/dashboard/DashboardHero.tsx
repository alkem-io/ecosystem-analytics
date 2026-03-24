import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { CreateSpaceDialog } from "@/app/components/dialogs/CreateSpaceDialog";

export function DashboardHero() {
  const [showCreateSpace, setShowCreateSpace] = useState(false);

  return (
    <div className="relative rounded-xl overflow-hidden min-h-[300px] flex items-center p-8 md:p-12 shadow-md">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1758873269276-9518d0cb4a0b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZW9wbGUlMjBjb2xsYWJvcmF0aW5nJTIwaW5ub3ZhdGlvbiUyMHRlYW13b3JrJTIwb2ZmaWNlJTIwY3JlYXRpdmUlMjB0ZWFtfGVufDF8fHx8MTc2OTA4NzU4N3ww&ixlib=rb-4.1.0&q=80&w=1080" 
          alt="Collaboration" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-900/50 mix-blend-multiply" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Welcome, Jeroen!
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-light">
            Ready to make some impact?
          </p>
        </div>
        
        <button 
          onClick={() => setShowCreateSpace(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-lg"
        >
          Create New Space
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <CreateSpaceDialog open={showCreateSpace} onOpenChange={setShowCreateSpace} />
    </div>
  );
}
