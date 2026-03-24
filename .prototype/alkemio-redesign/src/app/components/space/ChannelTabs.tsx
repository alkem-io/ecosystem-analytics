import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";

interface ChannelTab {
  id: string;
  label: string;
  count?: number;
}

interface ChannelTabsProps {
  tabs: ChannelTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function ChannelTabs({ tabs, activeTab, onTabChange }: ChannelTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 pb-2 border-b">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Button
            key={tab.id}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "rounded-full px-4 h-8 text-xs font-medium transition-all",
              isActive 
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" 
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "ml-2 py-0.5 px-1.5 rounded-full text-[10px]",
                isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/10 text-muted-foreground"
              )}>
                {tab.count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
