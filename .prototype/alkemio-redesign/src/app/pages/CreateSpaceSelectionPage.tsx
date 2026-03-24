import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, MessageSquare, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { CreateSpaceDialog } from "@/app/components/dialogs/CreateSpaceDialog";

export default function CreateSpaceSelectionPage() {
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="container max-w-5xl py-12 md:py-24 mx-auto">
      <div className="text-center mb-12 space-y-4">
        <h1 className="text-[length:var(--text-4xl)] lg:text-[length:5rem] font-extrabold tracking-tight">Create a New Space</h1>
        <p className="text-[length:var(--text-xl)] text-muted-foreground max-w-2xl mx-auto">
          Choose how you want to set up your new collaborative environment.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Option 1: Form Based */}
        <Card 
          className="relative group border-2 hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md" 
          onClick={() => setShowDialog(true)}
        >
          <CardHeader>
            <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
              <FileText className="w-6 h-6 text-foreground group-hover:text-primary transition-colors" />
            </div>
            <CardTitle className="text-[length:var(--text-2xl)]">Use Form</CardTitle>
            <CardDescription className="text-[length:var(--text-base)] mt-2">
              Fill out fields to create your space. Fastest for users who know exactly what they want.
            </CardDescription>
          </CardHeader>
          <CardFooter className="mt-auto pt-6">
             <Button variant="outline" className="w-full gap-2 group-hover:border-primary group-hover:text-primary text-[length:var(--text-base)]">
               Create with Form <ArrowRight className="w-4 h-4" />
             </Button>
          </CardFooter>
        </Card>

        {/* Option 2: Guided Chat */}
        <Card 
          className="relative group border-2 border-primary/20 hover:border-primary transition-all cursor-pointer shadow-md hover:shadow-lg bg-primary/5"
          onClick={() => navigate("/create-space/chat")}
        >
          <div className="absolute top-4 right-4">
             <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 gap-1 text-[length:var(--text-sm)]">
                <Sparkles className="w-3 h-3" /> New
             </Badge>
          </div>
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-[length:var(--text-2xl)]">Guided Creation</CardTitle>
            <CardDescription className="text-[length:var(--text-base)] mt-2">
              Have a conversation with our assistant. We'll ask questions to help you design your space structure and suggest templates.
            </CardDescription>
          </CardHeader>
          <CardFooter className="mt-auto pt-6">
             <Button className="w-full gap-2 text-[length:var(--text-base)]">
               Start Chat <Sparkles className="w-4 h-4" />
             </Button>
          </CardFooter>
        </Card>
      </div>

      <CreateSpaceDialog open={showDialog} onOpenChange={setShowDialog} />
    </div>
  );
}
