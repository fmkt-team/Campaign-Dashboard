export default function MasterPage() {
  return (
    <div className="min-h-screen p-8 text-white">
      <h1 className="text-3xl font-bold mb-8">Master Dashboard</h1>
      <div className="bg-white/8 backdrop-blur-md border border-white/15 rounded-2xl p-6 shadow-xl max-w-lg">
        <h2 className="text-xl mb-4">Create Admin Account</h2>
        <div className="flex flex-col gap-4">
          <input type="email" placeholder="New Admin Email" className="bg-white/10 border border-white/20 rounded-lg px-4 py-2" />
          <input type="password" placeholder="Temporary Password" className="bg-white/10 border border-white/20 rounded-lg px-4 py-2" />
          <button className="bg-primary text-primary-foreground font-bold py-2 rounded-lg">Create Admin</button>
        </div>
      </div>
    </div>
  );
}
