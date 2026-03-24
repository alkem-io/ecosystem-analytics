import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Send, User, Sparkles, X, ChevronRight, Check, 
  Layout, Users, Layers, FileText, ArrowLeft, Loader2,
  Briefcase, Lightbulb, GraduationCap, Target, Settings,
  MessageSquare, Image as ImageIcon, Tag, BookOpen, ShieldCheck
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import { Separator } from "@/app/components/ui/separator";
import { Progress } from "@/app/components/ui/progress";
import { Switch } from "@/app/components/ui/switch";
import { cn } from "@/lib/utils";

// --- Types ---

type Sender = "user" | "bot";
type MessageType = "text" | "options" | "cards" | "system";

interface Message {
  id: string;
  sender: Sender;
  type: MessageType;
  content: string;
  options?: Option[];
  cards?: InfoCard[];
  timestamp: Date;
}

interface Option {
  label: string;
  value: string;
  description?: string;
  icon?: React.ElementType;
}

interface InfoCard {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  items?: string[]; // For subspaces list
  tags?: string[];
  selected?: boolean;
}

interface SpaceConfig {
  name: string;
  description: string;
  purpose: string;
  audience: string;
  workflow: string;
  subspaces: SubspaceNode[];
  templates: string[];
  visibility: "private" | "members" | "public";
  bannerUrl?: string;
  tags: string[];
  features: {
    tutorials: boolean;
  };
  agreedToTerms: boolean;
}

interface SubspaceNode {
  id: string;
  name: string;
  type: string;
}

// --- Mock Data ---

const PURPOSE_OPTIONS: Option[] = [
  { label: "Innovation & Creativity", value: "innovation", icon: Lightbulb },
  { label: "Community Building", value: "community", icon: Users },
  { label: "Strategic Planning", value: "strategy", icon: Target },
  { label: "Knowledge Management", value: "knowledge", icon: GraduationCap },
  { label: "Project Delivery", value: "project", icon: Briefcase },
];

const WORKFLOW_OPTIONS: Option[] = [
  { label: "Structured Stages", value: "structured", description: "Ideate → Build → Execute" },
  { label: "Fluid & Flexible", value: "fluid", description: "Adapt as we go" },
  { label: "Agile / Scrum", value: "agile", description: "Sprints and backlogs" },
  { label: "Not sure yet", value: "unknown", description: "Just exploring" },
];

const SUBSPACE_SUGGESTIONS: Record<string, InfoCard[]> = {
  innovation: [
    { id: "stage_based", title: "By Stage", description: "Follow the lifecycle of an idea.", items: ["Ideation", "Validation", "Prototyping", "Launch"] },
    { id: "team_based", title: "By Function", description: "Organize by department.", items: ["Design", "Engineering", "Product", "Marketing"] },
  ],
  community: [
    { id: "topic_based", title: "By Topic", description: "Discussion channels.", items: ["Announcements", "Introductions", "General Chat", "Events"] },
    { id: "region_based", title: "By Region", description: "Local chapters.", items: ["North America", "Europe", "Asia-Pacific"] },
  ],
  default: [
    { id: "project_based", title: "By Project", description: "Separate space for each initiative.", items: ["Project Alpha", "Project Beta", "Internal Ops"] },
    { id: "simple", title: "Simple (No Subspaces)", description: "Keep everything in one place.", items: [] },
  ],
};

const TEMPLATE_SUGGESTIONS: Record<string, InfoCard[]> = {
  innovation: [
    { id: "brainstorming", title: "Brainstorming Board", description: "Canvas for ideation sessions.", tags: ["Whiteboard"] },
    { id: "feature_request", title: "Feature Requests", description: "Collect and upvote ideas.", tags: ["List"] },
    { id: "user_research", title: "User Research", description: "Repository for interview notes.", tags: ["Database"] },
  ],
  community: [
    { id: "guidelines", title: "Community Guidelines", description: "Rules and welcome info.", tags: ["Doc"] },
    { id: "events", title: "Event Calendar", description: "Upcoming meetups and webinars.", tags: ["Calendar"] },
    { id: "intros", title: "Member Directory", description: "Profiles of community members.", tags: ["Gallery"] },
  ],
  default: [
    { id: "tasks", title: "Task Tracker", description: "Kanban board for to-dos.", tags: ["Board"] },
    { id: "meeting_notes", title: "Meeting Notes", description: "Shared document for minutes.", tags: ["Doc"] },
    { id: "decision_log", title: "Decision Log", description: "Record of key outcomes.", tags: ["List"] },
  ],
};

const BANNER_OPTIONS: InfoCard[] = [
  { id: "abstract", title: "Abstract Blue", imageUrl: "https://images.unsplash.com/photo-1763562898665-dc13a919dc93?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGdlb21ldHJpYyUyMHNoYXBlcyUyMGJhY2tncm91bmQlMjBibHVlfGVufDF8fHx8MTc3MDI5NzM2Nnww&ixlib=rb-4.1.0&q=80&w=1080" },
  { id: "office", title: "Modern Workspace", imageUrl: "https://images.unsplash.com/photo-1758876021739-d7c60b8742a5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBvZmZpY2UlMjB0ZWFtd29yayUyMGlubm92YXRpb258ZW58MXx8fHwxNzcwMjk3MzY5fDA&ixlib=rb-4.1.0&q=80&w=1080" },
  { id: "nature", title: "Green Nature", imageUrl: "https://images.unsplash.com/photo-1674916251976-b64824a5f3de?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuYXR1cmUlMjBsYW5kc2NhcGUlMjBncmVlbiUyMGZvcmVzdHxlbnwxfHx8fDE3NzAyOTczNzN8MA&ixlib=rb-4.1.0&q=80&w=1080" },
  { id: "minimal", title: "Minimalist White", imageUrl: "https://images.unsplash.com/photo-1679304297749-32d4b5e13118?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYXJjaGl0ZWN0dXJlJTIwd2hpdGUlMjBicmlnaHR8ZW58MXx8fHwxNzcwMjk3Mzc2fDA&ixlib=rb-4.1.0&q=80&w=1080" },
  { id: "creative", title: "Creative Gradient", imageUrl: "https://images.unsplash.com/photo-1579547945478-a6681fb3c3c9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmFkaWVudCUyMGNyZWF0aXZlJTIwY29sb3JmdWwlMjBhYnN0cmFjdHxlbnwxfHx8fDE3NzAyOTczODB8MA&ixlib=rb-4.1.0&q=80&w=1080" },
];

// --- Components ---

const ChatMessageBubble = ({ message, onOptionSelect, onCardSelect }: { message: Message, onOptionSelect: (val: string, label: string) => void, onCardSelect: (id: string, multi: boolean) => void }) => {
  const isUser = message.sender === "user";

  return (
    <div className={cn("flex w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <Avatar className="w-8 h-8 mr-3 mt-1 shadow-sm">
          <AvatarFallback className="bg-primary text-primary-foreground"><Sparkles className="w-4 h-4" /></AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[85%] md:max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div className={cn("px-5 py-3.5 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap", 
          isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted/50 border border-border/50 text-foreground rounded-bl-sm")}>
          {message.content}
        </div>
        
        {/* Render Options (Chips) */}
        {message.options && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onOptionSelect(opt.value, opt.label)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-background border border-primary/20 hover:border-primary hover:bg-primary/5 text-primary rounded-full text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                {opt.icon && <opt.icon className="w-4 h-4" />}
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Render Cards (Regular or Image) */}
        {message.cards && (
          <div className={cn("grid gap-3 mt-3 w-full", 
             message.cards[0]?.imageUrl ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"
          )}>
            {message.cards.map((card) => (
              <div 
                key={card.id}
                onClick={() => onCardSelect(card.id, message.cards?.some(c => c.imageUrl) ? false : true)} 
                className={cn(
                  "rounded-xl border-2 text-left transition-all cursor-pointer hover:shadow-md overflow-hidden group",
                  card.selected 
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary" 
                    : "border-border bg-card hover:border-primary/50"
                )}
              >
                {card.imageUrl ? (
                  // Image Card Style
                  <div className="relative aspect-video w-full overflow-hidden">
                    <img 
                      src={card.imageUrl} 
                      alt={card.title} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3">
                       <span className="text-white font-medium text-sm truncate w-full">{card.title}</span>
                       {card.selected && <div className="absolute top-2 right-2 bg-primary text-white rounded-full p-0.5"><Check className="w-3 h-3" /></div>}
                    </div>
                  </div>
                ) : (
                  // Standard Card Style
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-semibold text-sm">{card.title}</h4>
                      {card.selected && <div className="bg-primary text-white rounded-full p-0.5"><Check className="w-3 h-3" /></div>}
                    </div>
                    {card.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{card.description}</p>}
                    {card.items && (
                      <div className="flex flex-wrap gap-1">
                        {card.items.slice(0, 3).map((item, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground">{item}</span>
                        ))}
                        {card.items.length > 3 && <span className="text-[10px] text-muted-foreground px-1">+ {card.items.length - 3}</span>}
                      </div>
                    )}
                    {card.tags && (
                      <div className="flex flex-wrap gap-1">
                        {card.tags.map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] h-5 font-normal">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Timestamp */}
        <div className={cn("text-[10px] text-muted-foreground mt-1.5 opacity-70", isUser ? "text-right" : "text-left")}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

const PreviewPanel = ({ config }: { config: SpaceConfig }) => (
  <div className="h-full bg-muted/10 border-l border-border p-6 flex flex-col overflow-hidden">
    <div className="mb-6 flex-1 overflow-y-auto pr-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Live Preview</h3>
      
      {/* Space Card */}
      <div className="bg-background border border-border rounded-xl shadow-sm mb-6 overflow-hidden">
        {/* Banner */}
        <div className="h-24 w-full bg-muted relative">
           {config.bannerUrl ? (
             <img src={config.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
           ) : (
             <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 bg-pattern-grid">
                <ImageIcon className="w-8 h-8" />
             </div>
           )}
        </div>
        
        <div className="px-5 pb-5 relative">
          {/* Avatar - Negative margin to pull it up */}
          <div className="w-16 h-16 -mt-8 mb-3 bg-background rounded-xl p-1 shadow-sm border border-border relative z-10">
             <div className="w-full h-full bg-primary/10 rounded-lg flex items-center justify-center text-primary font-bold text-xl">
               {config.purpose === 'innovation' ? <Lightbulb className="w-8 h-8" /> : 
                config.purpose === 'community' ? <Users className="w-8 h-8" /> :
                config.name.charAt(0) || <Layout className="w-8 h-8" />}
             </div>
          </div>

          <div>
            <h3 className="font-bold text-foreground text-lg">{config.name || "Untitled Space"}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <span className="capitalize px-1.5 py-0.5 bg-muted rounded text-[10px]">{config.visibility}</span>
              <span>•</span>
              <span>{config.purpose ? PURPOSE_OPTIONS.find(p => p.value === config.purpose)?.label : "Draft"}</span>
            </div>
          </div>

          {config.tags.length > 0 && (
             <div className="flex flex-wrap gap-1 mt-3">
               {config.tags.map(tag => (
                 <span key={tag} className="text-[10px] text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">#{tag}</span>
               ))}
             </div>
          )}

          {config.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-3">{config.description}</p>}
        </div>
      </div>

      {/* Structure Preview */}
      <div className="space-y-6">
        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
            <Layers className="w-3 h-3" /> Structure
          </h4>
          {config.subspaces.length > 0 ? (
            <div className="space-y-2 pl-2 border-l-2 border-border/50">
               {config.subspaces.map((sub, i) => (
                 <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-md bg-background border border-border/50 shadow-sm">
                   <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                   {sub.name}
                 </div>
               ))}
            </div>
          ) : (
             <div className="text-xs text-muted-foreground italic pl-2">No subspaces defined yet</div>
          )}
        </div>

        <div>
           <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
            <FileText className="w-3 h-3" /> Selected Templates
          </h4>
          {config.templates.length > 0 ? (
             <div className="flex flex-wrap gap-2">
                {config.templates.map((t, i) => (
                   <Badge key={i} variant="outline" className="bg-background">{t}</Badge>
                ))}
             </div>
          ) : (
             <div className="text-xs text-muted-foreground italic pl-2">No templates selected</div>
          )}
        </div>

        <div>
           <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
            <BookOpen className="w-3 h-3" /> Features
          </h4>
          <div className="flex items-center gap-2">
             <Badge variant={config.features.tutorials ? "default" : "outline"} className={cn("text-[10px]", !config.features.tutorials && "text-muted-foreground border-dashed")}>
                {config.features.tutorials ? "Tutorials Enabled" : "No Tutorials"}
             </Badge>
          </div>
        </div>
      </div>
    </div>

    <div className="mt-auto bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900/20 shrink-0">
      <div className="flex items-start gap-3">
         <div className="bg-blue-100 dark:bg-blue-900/30 p-1.5 rounded-full mt-0.5">
            <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
         </div>
         <div>
            <h5 className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">AI Insight</h5>
            <p className="text-[10px] text-blue-600/80 dark:text-blue-300/80 leading-snug">
               {config.purpose 
                 ? `I've adapted the flow for a ${config.purpose} space.` 
                 : "I'm listening to your requirements to build the perfect structure."}
            </p>
         </div>
      </div>
    </div>
  </div>
);

const SummaryView = ({ config, onBack, onCreate }: { config: SpaceConfig, onBack: () => void, onCreate: () => void }) => {
   const [isCreating, setIsCreating] = useState(false);

   const handleCreate = () => {
      if (!config.agreedToTerms) return;
      setIsCreating(true);
      setTimeout(() => {
         onCreate();
      }, 2000);
   };

   return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
         <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Chat
         </Button>
         <h2 className="text-2xl font-bold">Review Your Space</h2>
         <div className="w-24"></div> 
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
         {/* Edit Form */}
         <div className="lg:col-span-2 space-y-8">
            <Card>
               <CardHeader>
                  <CardTitle>General Details</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div className="space-y-2">
                     <label className="text-sm font-medium">Space Name</label>
                     <Input defaultValue={config.name} />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium">Description</label>
                     <Input defaultValue={config.description} />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-medium">Tags</label>
                     <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[42px]">
                        {config.tags.map(tag => (
                           <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                     </div>
                  </div>
               </CardContent>
            </Card>

            <Card>
               <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Subspaces</CardTitle>
                  <Button variant="outline" size="sm" className="h-8"><Settings className="w-3 h-3 mr-2" /> Configure</Button>
               </CardHeader>
               <CardContent>
                  {config.subspaces.length > 0 ? (
                     <div className="space-y-2">
                        {config.subspaces.map((sub, i) => (
                           <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg bg-card">
                              <span className="font-medium text-sm">{sub.name}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><X className="w-3 h-3" /></Button>
                           </div>
                        ))}
                     </div>
                  ) : (
                     <p className="text-sm text-muted-foreground italic">No subspaces configured.</p>
                  )}
               </CardContent>
            </Card>

            <Card>
               <CardHeader>
                  <CardTitle>Features & Settings</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                         <label className="text-sm font-medium">Include Tutorials</label>
                         <p className="text-xs text-muted-foreground">Add 'Getting Started' guides</p>
                      </div>
                      <Switch checked={config.features.tutorials} />
                   </div>
               </CardContent>
            </Card>
         </div>

         {/* Visual Summary */}
         <div className="space-y-6">
            <Card className="bg-primary/5 border-primary/20 overflow-hidden">
               {config.bannerUrl && (
                  <div className="h-32 w-full">
                     <img src={config.bannerUrl} className="w-full h-full object-cover" />
                  </div>
               )}
               <CardHeader>
                  <CardTitle className="text-lg">Space Overview</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div>
                     <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Subspaces</div>
                     <div className="text-2xl font-bold">{config.subspaces.length}</div>
                  </div>
                  <div>
                     <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Templates Applied</div>
                     <div className="text-2xl font-bold">{config.templates.length}</div>
                  </div>
                  <Separator className="bg-primary/20" />
                  
                  <div className="flex items-start gap-2 pt-2">
                     <Check className={cn("w-4 h-4 mt-0.5", config.agreedToTerms ? "text-primary" : "text-muted-foreground")} />
                     <p className="text-xs text-muted-foreground">
                        Agreed to Community Guidelines and Terms of Service.
                     </p>
                  </div>
               </CardContent>
               <CardFooter>
                  <Button className="w-full" size="lg" onClick={handleCreate} disabled={isCreating || !config.agreedToTerms}>
                     {isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating Space...</> : "Create Space"}
                  </Button>
               </CardFooter>
            </Card>
            
            <Button variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10">
               Cancel & Start Over
            </Button>
         </div>
      </div>
    </div>
   );
}

// --- Main Page Component ---

export default function CreateSpaceChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // State
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: "1", sender: "bot", type: "text", 
      content: "Hi! I'll help you design your space. Let's start with the basics. What is your space primarily about?",
      options: PURPOSE_OPTIONS,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [step, setStep] = useState(0); 
  // Steps Mapping:
  // 0: Purpose
  // 1: Audience
  // 2: Workflow
  // 3: Subspaces
  // 4: Templates Ask
  // 5: Templates Select
  // 6: Banner
  // 7: Tags
  // 8: Tutorials
  // 9: Terms
  // 10: Finished

  const [isFinished, setIsFinished] = useState(false);
  
  const [spaceConfig, setSpaceConfig] = useState<SpaceConfig>({
    name: "New Space",
    description: "",
    purpose: "",
    audience: "",
    workflow: "",
    subspaces: [],
    templates: [],
    visibility: "private",
    tags: [],
    features: { tutorials: false },
    agreedToTerms: false
  });

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Handle User Input
  const handleSend = (text: string = inputValue) => {
    if (!text.trim()) return;

    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      type: "text",
      content: text,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    // Process Bot Response after delay
    setTimeout(() => {
      processBotLogic(text);
    }, 1000 + Math.random() * 500); // Random delay 1-1.5s
  };

  const handleOptionSelect = (value: string, label: string) => {
     // Special handling for Terms
     if (step === 9 && value === "agree") {
         setSpaceConfig(prev => ({ ...prev, agreedToTerms: true }));
         handleSend(label);
         return;
     }

     // Normal handling
     handleSend(label);
     if (step === 0) setSpaceConfig(prev => ({ ...prev, purpose: value, name: `${label} Space` }));
     if (step === 2) setSpaceConfig(prev => ({ ...prev, workflow: value }));
     if (step === 8) setSpaceConfig(prev => ({ ...prev, features: { ...prev.features, tutorials: value === 'yes' } }));
  };
  
  const handleCardSelect = (id: string, multi: boolean) => {
     // Subspaces Step
     if (step === 3) {
        const selected = SUBSPACE_SUGGESTIONS[spaceConfig.purpose] || SUBSPACE_SUGGESTIONS['default'];
        const choice = selected.find(c => c.id === id);
        if (choice) {
           const newSubspaces = choice.items?.map(name => ({ id: name, name, type: 'default' })) || [];
           setSpaceConfig(prev => ({ ...prev, subspaces: newSubspaces }));
           
           // Visual feedback
           setMessages(prev => prev.map(m => {
              if (m.type === 'cards' && m.cards && m.cards.some(c => c.id === id)) {
                 return { ...m, cards: m.cards.map(c => ({ ...c, selected: c.id === id })) };
              }
              return m;
           }));

           // Auto advance
           setTimeout(() => {
              handleSend(`I'll go with ${choice.title}`);
           }, 800);
        }
     }

     // Templates Step (Multi)
     if (step === 5) {
        const templateName = id;
        
        if (spaceConfig.templates.includes(templateName)) {
           setSpaceConfig(prev => ({ ...prev, templates: prev.templates.filter(t => t !== templateName) }));
        } else {
           setSpaceConfig(prev => ({ ...prev, templates: [...prev.templates, templateName] }));
        }

        setMessages(prev => prev.map(m => {
           if (m.type === 'cards' && m.cards && m.cards.some(c => c.id === id)) {
              return { ...m, cards: m.cards.map(c => c.id === id ? { ...c, selected: !c.selected } : c) };
           }
           return m;
        }));
     }

     // Banner Step (Single)
     if (step === 6) {
         const banner = BANNER_OPTIONS.find(b => b.id === id);
         if (banner) {
             setSpaceConfig(prev => ({ ...prev, bannerUrl: banner.imageUrl }));
             
             setMessages(prev => prev.map(m => {
                if (m.type === 'cards' && m.cards && m.cards.some(c => c.id === id)) {
                    return { ...m, cards: m.cards.map(c => ({ ...c, selected: c.id === id })) };
                }
                return m;
             }));
             
             setTimeout(() => {
                handleSend(`${banner.title} style`);
             }, 800);
         }
     }
  };

  const processBotLogic = (lastUserText: string) => {
     let nextMsg: Message | null = null;
     let nextStep = step + 1;

     switch (step) {
        case 0: // Purpose -> Ask Audience
           nextMsg = {
              id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
              content: "Got it! So you're building a space for that. Who will be using this space? Tell me a bit about your team or community."
           };
           break;
        case 1: // Audience -> Ask Workflow
           setSpaceConfig(prev => ({ ...prev, audience: lastUserText, description: `A space for ${lastUserText}` }));
           nextMsg = {
              id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
              content: "Thanks. Now, how does your process typically flow?",
              options: WORKFLOW_OPTIONS
           };
           break;
        case 2: // Workflow -> Suggest Subspaces
           const suggestions = SUBSPACE_SUGGESTIONS[spaceConfig.purpose] || SUBSPACE_SUGGESTIONS['default'];
           nextMsg = {
              id: Date.now().toString(), sender: "bot", type: "cards", timestamp: new Date(),
              content: "Based on what you've told me, here are some subspace structures I'd suggest.",
              cards: suggestions
           };
           break;
        case 3: // Subspaces -> Ask Templates
           nextMsg = {
              id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
              content: "Great choice. Would you like me to recommend some templates to get you started?",
              options: [
                 { label: "Yes, please", value: "yes", icon: Check },
                 { label: "No, skip for now", value: "no", icon: X }
              ]
           };
           break;
        case 4: // Template Choice -> Select Templates or Banner
           if (lastUserText.toLowerCase().includes("no") || lastUserText.toLowerCase().includes("skip")) {
              nextStep = 6; // Skip to Banner
              nextMsg = {
                 id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
                 content: "No problem. Let's make the space look good. Choose a banner style:"
              };
              // Manually trigger the Banner card display logic below for consistency if we wanted, 
              // but simplest is to just proceed to step 6 logic in next turn? 
              // Actually, we need to show the cards NOW if we skipped.
              // So we adjust flow to just output the cards immediately:
               nextMsg = {
                  id: Date.now().toString(), sender: "bot", type: "cards", timestamp: new Date(),
                  content: "No problem. Let's make the space look good. Choose a banner style:",
                  cards: BANNER_OPTIONS
               };
           } else {
              // Show templates
              const templates = TEMPLATE_SUGGESTIONS[spaceConfig.purpose] || TEMPLATE_SUGGESTIONS['default'];
              nextMsg = {
                 id: Date.now().toString(), sender: "bot", type: "cards", timestamp: new Date(),
                 content: "Here are templates that fit your goals. Select the ones you want to add.",
                 cards: templates
              };
           }
           break;
        case 5: // Templates Selected -> Banner
            nextMsg = {
               id: Date.now().toString(), sender: "bot", type: "cards", timestamp: new Date(),
               content: "Excellent. Now, let's pick a visual theme for your banner.",
               cards: BANNER_OPTIONS
            };
            break;
        case 6: // Banner Selected -> Tags
            nextMsg = {
                id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
                content: "That looks great! Now, add some tags to help people find this space (separate with commas).",
            };
            break;
        case 7: // Tags Entered -> Tutorials
            // Process Tags
            const tags = lastUserText.split(',').map(t => t.trim()).filter(t => t.length > 0);
            setSpaceConfig(prev => ({ ...prev, tags }));
            
            nextMsg = {
                id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
                content: "Got those tags saved. Should I include a 'Getting Started' tutorial for new members?",
                options: [
                    { label: "Yes, include it", value: "yes", icon: BookOpen },
                    { label: "No, thanks", value: "no", icon: X }
                ]
            };
            break;
        case 8: // Tutorials Answered -> Terms
            nextMsg = {
                id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
                content: "Almost done. Please review and agree to the Community Guidelines to create your space.",
                options: [
                    { label: "I Agree to Terms", value: "agree", icon: ShieldCheck }
                ]
            };
            break;
        case 9: // Terms Agreed -> Finish
            nextMsg = {
               id: Date.now().toString(), sender: "bot", type: "text", timestamp: new Date(),
               content: "Perfect! I've configured everything. Let's review your new space."
            };
            setTimeout(() => setIsFinished(true), 2000);
            break;
        default:
           break;
     }

     if (nextMsg) {
        setMessages(prev => [...prev, nextMsg!]);
        setIsTyping(false);
        setStep(nextStep);
     }
  };

  if (isFinished) {
     return <SummaryView config={spaceConfig} onBack={() => setIsFinished(false)} onCreate={() => navigate(`/space/${spaceConfig.name.toLowerCase().replace(/\s+/g, '-')}`)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 bg-background z-10 shrink-0">
         <Button variant="ghost" size="sm" onClick={() => navigate("/create-space")} className="mr-4">
            <X className="w-4 h-4" />
         </Button>
         <div className="flex-1 flex flex-col justify-center">
            <div className="text-sm font-semibold flex items-center gap-2">
               Create Space <ChevronRight className="w-3 h-3 text-muted-foreground" /> Guided Chat
            </div>
            <Progress value={(step / 10) * 100} className="h-1 w-32 mt-1.5" />
         </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
         {/* Chat Area */}
         <div className="flex-1 flex flex-col relative">
            <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
               <div className="max-w-2xl mx-auto pb-4">
                  {messages.map((msg) => (
                     <ChatMessageBubble 
                        key={msg.id} 
                        message={msg} 
                        onOptionSelect={handleOptionSelect}
                        onCardSelect={handleCardSelect}
                     />
                  ))}
                  {isTyping && (
                     <div className="flex justify-start w-full mb-4 animate-in fade-in duration-300">
                        <Avatar className="w-8 h-8 mr-3 mt-1 shadow-sm">
                           <AvatarFallback className="bg-muted"><Sparkles className="w-4 h-4 text-muted-foreground" /></AvatarFallback>
                        </Avatar>
                        <div className="bg-muted/30 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
                           <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                           <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                           <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce"></span>
                        </div>
                     </div>
                  )}
                  <div ref={messagesEndRef} />
               </div>
            </div>
            
            {/* Input Area */}
            <div className="p-4 bg-background border-t border-border max-w-3xl mx-auto w-full">
               {step === 5 && (
                  <div className="flex justify-center mb-4">
                     <Button onClick={() => handleSend("Done selecting")} className="rounded-full px-8 shadow-md animate-in slide-in-from-bottom-2">
                        Done Selecting <Check className="w-4 h-4 ml-2" />
                     </Button>
                  </div>
               )}
               <div className="relative flex items-center gap-2">
                  <Input 
                     value={inputValue}
                     onChange={(e) => setInputValue(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && handleSend()}
                     placeholder="Type your answer..."
                     className="pr-12 py-6 rounded-full shadow-sm bg-muted/20 border-border focus:bg-background transition-colors"
                  />
                  <Button 
                     size="icon" 
                     onClick={() => handleSend()}
                     disabled={!inputValue.trim()}
                     className="absolute right-1.5 rounded-full w-9 h-9"
                  >
                     <Send className="w-4 h-4" />
                  </Button>
               </div>
            </div>
         </div>

         {/* Right Sidebar Preview (Desktop) */}
         <div className="hidden lg:block w-[400px] bg-muted/10 h-full border-l border-border shrink-0">
            <PreviewPanel config={spaceConfig} />
         </div>
      </div>
    </div>
  );
}
