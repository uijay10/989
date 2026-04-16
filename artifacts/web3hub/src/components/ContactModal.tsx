import { useState } from "react";
import { X, Send, CheckCircle } from "lucide-react";

function getApiBase() {
  const base = import.meta.env.BASE_URL ?? "/";
  const parts = base.replace(/\/$/, "").split("/");
  parts.pop();
  return parts.join("/") + "/api";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContactModal({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName(""); setEmail(""); setSubject(""); setMessage("");
    setError(""); setDone(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "提交失败，请稍后重试"); return; }
      setDone(true);
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-border/50 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h2 className="font-bold text-base text-foreground">联系我们</h2>
            <p className="text-xs text-muted-foreground mt-0.5">发送消息，管理团队将尽快回复您</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="font-semibold text-foreground">消息已发送！</p>
              <p className="text-sm text-muted-foreground">我们会尽快通过您的邮箱回复您，感谢联系。</p>
              <button
                onClick={handleClose}
                className="mt-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                关闭
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">姓名 *</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="您的姓名"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">邮箱 *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="your@email.com"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">主题 *</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                  placeholder="简短描述您的问题或需求"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">内容 *</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  required
                  rows={4}
                  placeholder="请详细描述您想咨询的内容..."
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? "发送中…" : <><Send className="w-3.5 h-3.5" />发送消息</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
