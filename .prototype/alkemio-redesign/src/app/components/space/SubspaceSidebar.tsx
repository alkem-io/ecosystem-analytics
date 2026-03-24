import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Info, ChevronLeft, ChevronRight, FileText, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface SubspaceSidebarProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function SubspaceSidebar({ className, isCollapsed = false, onToggleCollapse }: SubspaceSidebarProps) {
  // If no external control is provided, we can use local state for demonstration,
  // but usually layout handles this. We'll rely on the parent to handle layout width changes.

  return (
    <div className={cn("relative transition-all duration-300 ease-in-out h-full", 
      isCollapsed ? "w-12" : "w-full md:w-80",
      className
    )}>
      {/* Collapse Toggle Button - Absolute positioned to stick to the side */}
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn(
          "absolute -right-3 top-0 z-20 h-6 w-6 rounded-full border bg-background shadow-md hidden md:flex",
          isCollapsed && "rotate-180"
        )}
        onClick={onToggleCollapse}
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>

      <div className={cn("flex flex-col gap-6 overflow-hidden", isCollapsed ? "opacity-0 invisible" : "opacity-100 visible")}>
        
        {/* Description / Challenge Statement */}
        <Card className="border-l-4 border-l-primary shadow-sm bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4" />
              Challenge Statement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground">
              How might we design a collaborative platform that empowers distributed teams to innovate effectively while maintaining social connection?
            </p>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="w-full text-xs">
                Read Full Brief
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-2">
                <Button variant="ghost" className="justify-start gap-3 h-auto py-3 bg-secondary/30 hover:bg-secondary/60">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm">Project Docs</span>
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-auto py-3 bg-secondary/30 hover:bg-secondary/60">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="text-sm">Team Roster</span>
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-auto py-3 bg-secondary/30 hover:bg-secondary/60">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-sm">Schedule</span>
                </Button>
            </div>
        </div>

        {/* About Section */}
        <div className="mt-auto p-4 bg-muted/20 rounded-lg">
            <h4 className="font-medium text-sm mb-1">About this Subspace</h4>
            <p className="text-xs text-muted-foreground mb-3">
                Created on Jan 12, 2024 by Sarah Chen.
            </p>
            <Button size="sm" variant="secondary" className="w-full">
                More Info
            </Button>
        </div>

      </div>
    </div>
  );
}
