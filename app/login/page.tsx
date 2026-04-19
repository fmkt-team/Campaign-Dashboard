export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md bg-white/8 backdrop-blur-md border border-white/15 rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">Login</h1>
        <div className="flex flex-col gap-4">
          <input type="email" placeholder="Email" className="bg-white/10 border border-white/20 text-white rounded-lg px-4 py-2" />
          <input type="password" placeholder="Password" className="bg-white/10 border border-white/20 text-white rounded-lg px-4 py-2" />
          <button className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold py-2 px-4 rounded-lg transition">Sign In</button>
        </div>
      </div>
    </div>
  );
}
