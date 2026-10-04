// AUTONOMOUS ENDPOINTS CONTINUATION
  db.prepare(`UPDATE autonomous_config SET target_niche = ?, updated_at = ? WHERE id = 'default_config'`).run(targetNiche, new Date().toISOString());
  }

  const state = getDatabaseState();
  res.json({ success: true, config: state.autonomous24x7 });
});

app.post("/api/autonomous/trigger-cycle", async (req, res) => {
  const result = await runAutonomous24x7Cycle();
  const state = getDatabaseState();
  res.json({
    ...result,
    analytics: state.analytics,
    config: state.autonomous24x7
  });
});

// Vite Middleware for development & Static Serving for production
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  startAuthMaintenance();

  // Start background job queue worker
  startJobWorker();

  // Start 24x7 autonomous background reel agent daemon
  initAutonomousDaemon();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Instagram AI Growth Agent Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
