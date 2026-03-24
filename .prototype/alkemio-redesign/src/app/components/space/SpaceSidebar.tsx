import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { ChevronRight, Folder, Hash } from "lucide-react";
import { Link } from "react-router";

interface SpaceSidebarProps {
  spaceSlug: string;
}

export function SpaceSidebar({ spaceSlug }: SpaceSidebarProps) {
  const subspaces = [
    { name: "Renewable Energy", icon: Folder, count: 12 },
    { name: "Urban Planning", icon: Folder, count: 8 },
    { name: "Transportation", icon: Folder, count: 5 },
  ];

  return (
    <div className="space-y-6 w-full lg:w-80 shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto no-scrollbar">
      {/* Welcome Callout */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-primary">Welcome!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Welcome to the Innovation Hub. Start by exploring our subspaces or creating a new post to share your ideas.
          </p>
          <Button variant="outline" size="sm" className="w-full border-primary/20 hover:bg-primary/10 text-primary">
            View Guidelines
          </Button>
        </CardContent>
      </Card>

      {/* Subspaces List */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Subspaces</h3>
          <Link 
            to={`/space/${spaceSlug}/subspaces`} 
            className="text-xs text-primary hover:underline flex items-center"
          >
            Show all
          </Link>
        </div>
        <div className="space-y-1">
          {subspaces.map((subspace, index) => (
            <Link
              key={index}
              to={`/${spaceSlug}/challenges/${subspace.name.toLowerCase().replace(/\s+/g, '-')}`}
              className="group flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-muted rounded-md group-hover:bg-background group-hover:shadow-sm transition-all">
                  <subspace.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{subspace.name}</span>
              </div>
              <div className="flex items-center text-muted-foreground">
                <span className="text-xs mr-2">{subspace.count}</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
