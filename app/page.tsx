"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GlassCard } from "@/components/glass-card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function DashboardHome() {
  // Temporary: In a real app we'd fetch actual data, or show loading state if undefined
  const campaigns = useQuery(api.campaigns.getCampaigns);

  return (
    <div className="min-h-screen p-8 lg:p-12 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Campaign Dashboard</h1>
        <Link href="/campaigns/new">
          <Button className="bg-gray-900 text-white hover:bg-gray-800 font-semibold gap-2">
            <Plus className="w-4 h-4" /> New Campaign
          </Button>
        </Link>
      </div>

      <div className="mb-12">
        <h2 className="text-xl font-medium text-gray-500 mb-6">Active Campaigns</h2>
        {campaigns === undefined ? (
          <p className="text-gray-400">Loading...</p>
        ) : campaigns.length === 0 ? (
          <GlassCard className="text-center py-12">
            <p className="text-gray-400 mb-4">No active campaigns.</p>
            <Link href="/campaigns/new">
              <Button variant="outline" className="text-gray-700 border-gray-200 hover:bg-gray-50">Create One</Button>
            </Link>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.filter(c => c.status === "active").map(campaign => (
              <Link href={`/campaigns/${campaign._id}/timeline`} key={campaign._id}>
                <GlassCard className="transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer group">
                  <div className="flex gap-3 mb-4 items-center">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: campaign.brandColor }} />
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-gray-700">{campaign.name}</h3>
                  </div>
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>{campaign.startDate} ~ {campaign.endDate}</span>
                    <span className="font-mono bg-green-50 text-green-600 px-2 py-0.5 rounded text-xs border border-green-100">Active</span>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
      
      {/* Archive section could be added here */}
    </div>
  );
}
