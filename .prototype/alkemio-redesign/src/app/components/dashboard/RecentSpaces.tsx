import Slider from "react-slick";
import { Lock, ArrowRight, MoreHorizontal } from "lucide-react";
import "slick-carousel/slick/slick.css"; 
import "slick-carousel/slick/slick-theme.css";
import { useNavigate } from "react-router";
import { useState } from "react";
import { ExploreSpacesDialog } from "@/app/components/dialogs/ExploreSpacesDialog";

const recentSpaces = [
  {
    id: 1,
    name: "Innovation Lab",
    slug: "innovation-lab",
    image: "https://images.unsplash.com/photo-1623652554515-91c833e3080e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb2xsYWJvcmF0aW9uJTIwdGVhbXdvcmslMjBpbm5vdmF0aW9uJTIwZGVzaWduJTIwdGhpbmtpbmclMjB3b3Jrc2hvcHxlbnwxfHx8fDE3NjkwODc1ODd8MA&ixlib=rb-4.1.0&q=80&w=1080",
    isPrivate: true,
    color: "bg-blue-500",
    initials: "IL"
  },
  {
    id: 2,
    name: "Design Workshop",
    slug: "design-workshop",
    image: "https://images.unsplash.com/photo-1735639013995-086e648eaa38?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxicmFpbnN0b3JtaW5nJTIwY3JlYXRpdmUlMjB3b3Jrc2hvcCUyMHRlYW18ZW58MXx8fHwxNzY5MDg3NTg3fDA&ixlib=rb-4.1.0&q=80&w=1080",
    isPrivate: false,
    color: "bg-purple-500",
    initials: "DW"
  },
  {
    id: 3,
    name: "Team Sync",
    slug: "team-sync",
    image: "https://images.unsplash.com/photo-1768659347532-74d3b1efb0ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ24lMjBtZWV0aW5nJTIwY29sbGFib3JhdGlvbiUyMHRlYW18ZW58MXx8fHwxNzY5MDg3NTg3fDA&ixlib=rb-4.1.0&q=80&w=1080",
    isPrivate: true,
    color: "bg-green-500",
    initials: "TS"
  },
  {
    id: 4,
    name: "Future Strategy",
    slug: "future-strategy",
    image: "https://images.unsplash.com/photo-1676276376052-dc9c9c0b6917?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbm5vdmF0aW9uJTIwbGFiJTIwdGVhbXdvcmslMjBtb2Rlcm4lMjBvZmZpY2V8ZW58MXx8fHwxNzY5MDg3NTg2fDA&ixlib=rb-4.1.0&q=80&w=1080",
    isPrivate: false,
    color: "bg-orange-500",
    initials: "FS"
  }
];

export function RecentSpaces() {
  const navigate = useNavigate();
  const [showExplore, setShowExplore] = useState(false);

  const settings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 3,
    slidesToScroll: 1,
    responsive: [
      {
        breakpoint: 1024,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
        }
      },
      {
        breakpoint: 640,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1
        }
      }
    ]
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Recent Spaces</h2>
        <button 
          onClick={() => setShowExplore(true)}
          className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 bg-transparent border-0 cursor-pointer"
        >
          Explore all your Spaces <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="-mx-2">
        <Slider {...settings} className="recent-spaces-slider pb-8">
          {recentSpaces.map((space) => (
            <div key={space.id} className="px-2">
              <div 
                onClick={() => navigate(`/space/${space.slug}`)}
                className="group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all duration-300 cursor-pointer h-full"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video overflow-hidden">
                  <img 
                    src={space.image} 
                    alt={space.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  
                  {space.isPrivate && (
                    <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm p-1.5 rounded-full text-white">
                      <Lock className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${space.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                    {space.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-card-foreground truncate">{space.name}</h3>
                    <p className="text-xs text-muted-foreground">Last visited 2h ago</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </Slider>
      </div>
      
      <ExploreSpacesDialog open={showExplore} onOpenChange={setShowExplore} />
    </div>
  );
}
