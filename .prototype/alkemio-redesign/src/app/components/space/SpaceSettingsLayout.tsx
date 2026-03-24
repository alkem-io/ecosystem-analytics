import { useState, useRef, useEffect, useMemo } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { 
  Home, 
  Users, 
  Layers, 
  BookOpen, 
  GripVertical, 
  Pencil, 
  RotateCcw, 
  Save, 
  Check, 
  Loader2,
  MessageSquare, 
  Calendar, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Map, 
  Globe, 
  Smile, 
  Star, 
  Heart, 
  Zap, 
  Activity, 
  Grid, 
  List, 
  Layout as LayoutIcon,
  Search,
  Settings,
  Bell,
  Mail,
  Briefcase
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Separator } from "@/app/components/ui/separator";
import { cn } from "@/lib/utils";

// --- Types ---
type TabId = "home" | "community" | "subspaces" | "knowledge";

interface TabItem {
  id: TabId;
  label: string;
  defaultLabel: string;
  icon: React.ElementType;
  description: string;
  defaultIndex: number; // 0-based
}

const AVAILABLE_ICONS = [
  { icon: Home, label: "Home" },
  { icon: Users, label: "Users" },
  { icon: Layers, label: "Layers" },
  { icon: BookOpen, label: "Book" },
  { icon: MessageSquare, label: "Chat" },
  { icon: Calendar, label: "Calendar" },
  { icon: FileText, label: "Document" },
  { icon: ImageIcon, label: "Image" },
  { icon: Video, label: "Video" },
  { icon: Map, label: "Map" },
  { icon: Globe, label: "Globe" },
  { icon: Smile, label: "Smile" },
  { icon: Star, label: "Star" },
  { icon: Heart, label: "Heart" },
  { icon: Zap, label: "Zap" },
  { icon: Activity, label: "Activity" },
  { icon: Grid, label: "Grid" },
  { icon: List, label: "List" },
  { icon: LayoutIcon, label: "Layout" },
  { icon: Search, label: "Search" },
  { icon: Settings, label: "Settings" },
  { icon: Bell, label: "Bell" },
  { icon: Mail, label: "Mail" },
  { icon: Briefcase, label: "Briefcase" },
];

// --- Initial Data ---
const DEFAULT_TABS: TabItem[] = [
  {
    id: "home",
    label: "Home",
    defaultLabel: "Home",
    icon: Home,
    description: "The main landing page for your space, showcasing highlights and pinned content.",
    defaultIndex: 0
  },
  {
    id: "community",
    label: "Community",
    defaultLabel: "Community",
    icon: Users,
    description: "Member directory and profiles associated with this space.",
    defaultIndex: 1
  },
  {
    id: "subspaces",
    label: "Subspaces",
    defaultLabel: "Subspaces",
    icon: Layers,
    description: "Child spaces and projects organized under this parent space.",
    defaultIndex: 2
  },
  {
    id: "knowledge",
    label: "Knowledge",
    defaultLabel: "Knowledge",
    icon: BookOpen,
    description: "Wiki, documentation, and shared resources for members.",
    defaultIndex: 3
  }
];

// --- Drag & Drop Item Type ---
const ItemType = "TAB_CARD";

interface DragItem {
  index: number;
  id: string;
  type: string;
}

// --- Sortable Tab Component ---
interface SortableTabProps {
  tab: TabItem;
  index: number;
  moveTab: (dragIndex: number, hoverIndex: number) => void;
  onRename: (id: TabId, newName: string) => void;
  onIconChange: (id: TabId, newIcon: React.ElementType) => void;
  isEditing: boolean;
  setEditingId: (id: TabId | null) => void;
}

const SortableTab = ({ tab, index, moveTab, onRename, onIconChange, isEditing, setEditingId }: SortableTabProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);

  // Close icon picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(event.target as Node)) {
        setShowIconPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: string | symbol | null }>({
    accept: ItemType,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) return;
      
      const dragIndex = item.index;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) return;

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the top
      const hoverClientY = (clientOffset as any).y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      // Time to actually perform the action
      moveTab(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: () => {
      return { id: tab.id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  const Icon = tab.icon;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setEditingId(null);
    } else if (e.key === 'Escape') {
      // Revert changes? (For now just exit edit mode, assuming onChange handles value)
      setEditingId(null);
    }
  };

  const ordinalSuffix = (i: number) => {
    const j = i % 10,
          k = i % 100;
    if (j === 1 && k !== 11) return i + "st";
    if (j === 2 && k !== 12) return i + "nd";
    if (j === 3 && k !== 13) return i + "rd";
    return i + "th";
  };

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={cn(
        "group relative flex items-center gap-4 p-4 bg-card border border-border rounded-xl transition-all",
        isDragging ? "opacity-30 border-dashed" : "hover:border-primary/50 hover:shadow-sm",
        isEditing && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {/* Drag Handle */}
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground">
        <GripVertical className="w-5 h-5" />
      </div>

      {/* Icon */}
      <div className="relative">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setShowIconPicker(!showIconPicker);
          }}
          className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title="Change Icon"
        >
          <Icon className="w-5 h-5" />
        </button>

        {/* Icon Picker Popover */}
        {showIconPicker && (
          <div 
            ref={iconPickerRef}
            className="absolute left-0 top-12 z-50 w-64 bg-popover text-popover-foreground rounded-lg border border-border shadow-md p-2 grid grid-cols-6 gap-1"
          >
            {AVAILABLE_ICONS.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  onIconChange(tab.id, item.icon);
                  setShowIconPicker(false);
                }}
                className={cn(
                  "p-1.5 rounded-md hover:bg-accent hover:text-accent-foreground flex items-center justify-center",
                  tab.icon === item.icon && "bg-accent text-accent-foreground"
                )}
                title={item.label}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={tab.label}
              onChange={(e) => onRename(tab.id, e.target.value)}
              onBlur={() => setEditingId(null)}
              onKeyDown={handleKeyDown}
              className="h-7 py-0 px-1.5 font-semibold w-full max-w-[200px]"
            />
          ) : (
            <h4 
              className="font-semibold text-sm cursor-pointer hover:underline decoration-dashed underline-offset-4"
              onClick={() => setEditingId(tab.id)}
            >
              {tab.label}
            </h4>
          )}
          
          {!isEditing && (
             <button 
                onClick={() => setEditingId(tab.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
             >
                <Pencil className="w-3.5 h-3.5" />
             </button>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
          {tab.description}
        </p>
      </div>

      {/* Meta Info */}
      <div className="text-right hidden sm:block">
        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
          Default: {ordinalSuffix(tab.defaultIndex + 1)}
        </span>
      </div>
    </div>
  );
};


// --- Main Layout Component ---
export function SpaceSettingsLayout() {
  const [tabs, setTabs] = useState<TabItem[]>(DEFAULT_TABS);
  const [editingId, setEditingId] = useState<TabId | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Check if changes exist
  const hasChanges = useMemo(() => {
    if (tabs.length !== DEFAULT_TABS.length) return true;
    return tabs.some((tab, i) => {
      const defaultTab = DEFAULT_TABS[i];
      return tab.id !== defaultTab.id || 
             tab.label !== defaultTab.label || 
             tab.icon !== defaultTab.icon;
    });
  }, [tabs]);

  const moveTab = (dragIndex: number, hoverIndex: number) => {
    const dragTab = tabs[dragIndex];
    const newTabs = [...tabs];
    newTabs.splice(dragIndex, 1);
    newTabs.splice(hoverIndex, 0, dragTab);
    setTabs(newTabs);
  };

  const handleRename = (id: TabId, newName: string) => {
    // Max 20 chars
    if (newName.length > 20) return;
    
    setTabs(prev => prev.map(tab => 
      tab.id === id ? { ...tab, label: newName } : tab
    ));
  };

  const handleIconChange = (id: TabId, newIcon: React.ElementType) => {
    setTabs(prev => prev.map(tab => 
      tab.id === id ? { ...tab, icon: newIcon } : tab
    ));
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setLastSaved(new Date());
    }, 1000);
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all tabs to their default names and order?")) {
      setTabs(DEFAULT_TABS);
      setLastSaved(null);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="w-full h-full">
        {/* LEFT COLUMN - EDITOR */}
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold">Layout</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Customize your Space's navigation tabs. You can rename and reorder the four main tabs below.
            </p>
          </div>
          
          {/* Tab List */}
          <div className="space-y-3 flex-1">
            {tabs.map((tab, index) => (
              <SortableTab
                key={tab.id}
                index={index}
                tab={tab}
                moveTab={moveTab}
                onRename={handleRename}
                onIconChange={handleIconChange}
                isEditing={editingId === tab.id}
                setEditingId={setEditingId}
              />
            ))}
          </div>

          {/* Footer Actions */}
          <div className="mt-8 pt-6 border-t border-border flex items-center justify-between sticky bottom-0 bg-background/95 backdrop-blur py-4 z-10">
             <Button 
               variant="ghost" 
               onClick={handleReset}
               disabled={!hasChanges && !lastSaved}
               className="text-muted-foreground hover:text-destructive"
             >
               <RotateCcw className="w-4 h-4 mr-2" /> Reset to Default
             </Button>
             
             <div className="flex items-center gap-4">
               {lastSaved && (
                 <span className="text-sm text-green-600 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2">
                   <Check className="w-4 h-4" /> Saved
                 </span>
               )}
               <Button 
                 onClick={handleSave} 
                 disabled={!hasChanges || isSaving}
                 className="min-w-[140px]"
               >
                 {isSaving ? (
                   <>
                     <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                   </>
                 ) : (
                   <>
                     <Save className="w-4 h-4 mr-2" /> Save Changes
                   </>
                 )}
               </Button>
             </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
