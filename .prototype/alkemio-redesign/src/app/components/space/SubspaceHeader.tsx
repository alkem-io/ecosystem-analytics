import { Link } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import { ChevronLeft, MoreHorizontal, Search, Settings, Share2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubspaceHeaderProps {
  spaceSlug: string;
  subspaceSlug: string;
  title: string;
  description: string;
  parentSpaceName: string;
  imageUrl: string;
}

export function SubspaceHeader({
  spaceSlug,
  subspaceSlug,
  title,
  description,
  parentSpaceName,
  imageUrl,
}: SubspaceHeaderProps) {
  return (
    <div className="relative w-full h-[320px] overflow-hidden group">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div className="absolute inset-0 bg-black/50" />

      {/* Content Container */}
      <div className="relative h-full container mx-auto px-6 py-8 flex flex-col justify-between">
        
        {/* Top Bar: Breadcrumb & Utilities */}
        <div className="flex items-center justify-between text-white/90">
          <Link 
            to={`/space/${spaceSlug}`}
            className="flex items-center gap-2 text-sm font-medium hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to {parentSpaceName}
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
              <Search className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
              <Maximize2 className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Bottom Section: Title, Description, Members */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6">
          <div className="max-w-2xl text-white">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{title}</h1>
            <p className="text-lg text-white/90 leading-relaxed max-w-xl">
              {description}
            </p>
          </div>

          <div className="flex items-center gap-4">
             {/* Member Avatars */}
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map((i) => (
                <Avatar key={i} className="border-2 border-transparent ring-2 ring-black/20 w-10 h-10 transition-transform hover:z-10 hover:scale-110">
                  <AvatarImage src={`https://i.pravatar.cc/150?u=${i}`} />
                  <AvatarFallback className="bg-primary/20 text-white text-xs">U{i}</AvatarFallback>
                </Avatar>
              ))}
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border-2 border-transparent ring-2 ring-black/20 text-white text-xs font-medium hover:bg-white/30 cursor-pointer transition-colors">
                +12
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
