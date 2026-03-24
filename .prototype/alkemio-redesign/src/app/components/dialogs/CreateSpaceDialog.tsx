import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/app/components/ui/dialog";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { useState } from "react";
import { X, ArrowRight, FileText, MessageSquare, Sparkles, ArrowLeft } from "lucide-react";
import { CreateSpaceChat } from "../create-space/CreateSpaceChat";
import { CreateSpaceForm } from "../create-space/CreateSpaceForm";
import { cn } from "@/lib/utils";

interface CreateSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DialogView = "selection" | "chat" | "form";

export function CreateSpaceDialog({ open, onOpenChange }: CreateSpaceDialogProps) {
  const [view, setView] = useState<DialogView>("selection");

  const handleClose = () => {
    onOpenChange(false);
    // Reset view after animation finishes
    setTimeout(() => setView("selection"), 300);
  };

  const handleBack = () => {
    setView("selection");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "p-0 gap-0 overflow-hidden rounded-xl border-0 shadow-2xl bg-background flex flex-col transition-all duration-300",
        view === "chat" ? "max-w-[95vw] h-[90vh] md:max-w-screen-xl" : "max-w-4xl h-[80vh] md:h-auto"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-2">
             {view !== "selection" && (
                <Button variant="ghost" size="icon" onClick={handleBack} className="mr-2 h-8 w-8 rounded-full">
                   <ArrowLeft className="w-4 h-4" />
                </Button>
             )}
             <DialogTitle className="font-semibold tracking-tight text-[length:var(--text-xl)]">
               {view === "selection" && "Create a new Space"}
               {view === "form" && "New Space Details"}
               {view === "chat" && "Design Your Space"}
             </DialogTitle>
          </div>
          <DialogClose className="rounded-full p-2 hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </DialogClose>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-muted/5">
          {view === "selection" && (
             <div className="h-full overflow-y-auto p-6 md:p-12 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center mb-8 space-y-2 max-w-lg">
                   <h2 className="text-[length:var(--text-2xl)] font-bold">How would you like to start?</h2>
                   <p className="text-[length:var(--text-base)] text-muted-foreground">
                      Choose the method that best fits your workflow.
                   </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 w-full max-w-3xl">
                  {/* Form Option */}
                  <Card 
                    className="relative group border-2 hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md bg-card" 
                    onClick={() => setView("form")}
                  >
                    <CardHeader>
                      <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                        <FileText className="w-6 h-6 text-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <CardTitle className="text-[length:var(--text-xl)]">Use Form</CardTitle>
                      <CardDescription className="text-[length:var(--text-sm)] mt-2">
                        Fill out fields directly. Best if you know exactly what you need.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                       <Button variant="outline" className="w-full gap-2 group-hover:border-primary group-hover:text-primary text-[length:var(--text-sm)]">
                         Select Form <ArrowRight className="w-4 h-4" />
                       </Button>
                    </CardFooter>
                  </Card>

                  {/* Chat Option */}
                  <Card 
                    className="relative group border-2 border-primary/20 hover:border-primary transition-all cursor-pointer shadow-md hover:shadow-lg bg-primary/5"
                    onClick={() => setView("chat")}
                  >
                    <div className="absolute top-4 right-4">
                       <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 gap-1 text-[length:var(--text-xs)]">
                          <Sparkles className="w-3 h-3" /> AI
                       </Badge>
                    </div>
                    <CardHeader>
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                        <MessageSquare className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-[length:var(--text-xl)]">Guided Creation</CardTitle>
                      <CardDescription className="text-[length:var(--text-sm)] mt-2">
                        Chat with our AI assistant to design your space structure and get recommendations.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                       <Button className="w-full gap-2 text-[length:var(--text-sm)]">
                         Start Chat <Sparkles className="w-4 h-4" />
                       </Button>
                    </CardFooter>
                  </Card>
                </div>
             </div>
          )}

          {view === "form" && (
             <div className="h-full animate-in slide-in-from-right-8 duration-300">
                <CreateSpaceForm onCancel={handleBack} onSuccess={handleClose} />
             </div>
          )}

          {view === "chat" && (
             <div className="h-full animate-in slide-in-from-right-8 duration-300">
                <CreateSpaceChat onClose={handleClose} />
             </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
