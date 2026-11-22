package com.madrasa.management;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_FILE_CHOOSER = 4001;
    private WebView webView;
    private Handler ui;
    private ValueCallback<Uri[]> pendingFileChoosers;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(Color.parseColor("#0d5c46"));

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFileChoosers != null) {
                    pendingFileChoosers.onReceiveValue(null);
                }
                pendingFileChoosers = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    pendingFileChoosers = null;
                    toast("ফাইল নির্বাচক খোলা যায়নি: " + e.getMessage());
                    return false;
                }
                return true;
            }
        });
        webView.loadUrl("file:///android_asset/app/index.html");
        ui = new Handler();
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("(typeof closeDrawer === 'function' ? closeDrawer() : false)", null);
            if (webView.canGoBack()) {
                webView.goBack();
                return;
            }
        }
        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER && pendingFileChoosers != null) {
            pendingFileChoosers.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFileChoosers = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void toast(final String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    class Bridge {

        @JavascriptInterface
        public void showToast(String msg) { toast(msg); }

        @JavascriptInterface
        public String loadDb() {
            return readAll(new File(getFilesDir(), "db.json"));
        }

        @JavascriptInterface
        public boolean saveDb(String json) {
            try {
                File dir = getFilesDir();
                File db = new File(dir, "db.json");
                File tmp = new File(dir, "db.json.tmp");
                writeAll(tmp, json);
                if (!tmp.renameTo(db)) {
                    db.delete();
                    if (!tmp.renameTo(db)) writeAll(db, json);
                }
                File day = new File(dir, "bk-day.json");
                if (!wasSavedToday(day)) writeAll(day, json);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean createSnapshot(String json) {
            try {
                File dir = new File(getFilesDir(), "snapshots");
                if (!dir.exists()) dir.mkdirs();
                String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
                writeAll(new File(dir, "snap-" + stamp + ".json"), json);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String listSnapshots() {
            File dir = new File(getFilesDir(), "snapshots");
            File[] arr = dir.listFiles();
            if (arr == null) return "[]";
            List<File> files = new ArrayList<>(Arrays.asList(arr));
            Collections.sort(files, (a, b) -> b.getName().compareTo(a.getName()));
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < files.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(toJsonString(files.get(i).getName()));
            }
            return sb.append("]").toString();
        }

        @JavascriptInterface
        public String getSnapshot(String name) {
            if (name == null || !name.startsWith("snap-") || name.contains("/") || name.contains("..")) return "";
            return readAll(new File(new File(getFilesDir(), "snapshots"), name));
        }

        @JavascriptInterface
        public void deleteSnapshot(String name) {
            if (name == null || !name.startsWith("snap-") || name.contains("/") || name.contains("..")) return;
            new File(new File(getFilesDir(), "snapshots"), name).delete();
        }

        @JavascriptInterface
        public void printHtml(String docName, String html) {
            ui.post(() -> runPrint(docName, html));
        }

        @JavascriptInterface
        public void shareFile(String fileName, String content, String mime) {
            ui.post(() -> {
                try {
                    writeShared(fileName, content);
                    Uri uri = Uri.parse("content://com.madrasa.management.files/" + fileName.replace(" ", "%20"));
                    Intent it = new Intent(Intent.ACTION_SEND);
                    it.setType(mime);
                    it.putExtra(Intent.EXTRA_STREAM, uri);
                    it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(it, "শেয়ার করুন"));
                } catch (Exception e) {
                    toast("শেয়ার করা যায়নি: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void writeFile(String fileName, String content) {
            ui.post(() -> {
                try {
                    File f = writeShared(fileName, content);
                    toast("সংরক্ষিত হয়েছে: " + f.getAbsolutePath());
                } catch (Exception e) {
                    toast("সংরক্ষণ ব্যর্থ: " + e.getMessage());
                }
            });
        }

        private File writeShared(String fileName, String content) throws IOException {
            if (fileName == null || fileName.trim().isEmpty()) fileName = "file.txt";
            String safe = fileName.replaceAll("[^\\p{L}\\p{N}._ -]", "_");
            File dir = new File(getFilesDir(), "shared");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, safe);
            writeAll(f, content);
            return f;
        }

        private void runPrint(String docName, String html) {
            try {
                final String name = (docName == null || docName.trim().isEmpty()) ? "MadrasaDoc" : docName.trim();
                WebView printView = new WebView(MainActivity.this);
                printView.setVisibility(View.GONE);
                addContentView(printView, new FrameLayout.LayoutParams(1, 1));
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView v, String url) {
                        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(new PrintAttributes.MediaSize("ISO_A4", "android.ISO_A4", 827, 1169))
                                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                .build();
                        pm.print(name, v.createPrintDocumentAdapter(name), attrs);
                    }
                });
                printView.loadDataWithBaseURL(null, wrapPrintHtml(html), "text/html", "utf-8", null);
            } catch (Exception e) {
                toast("প্রিন্ট শুরু করা যায়নি: " + e.getMessage());
            }
        }

        private String wrapPrintHtml(String html) {
            return "<html><head><meta charset='utf-8'><style>"
                    + "body { font-family: 'Noto Sans Bengali', sans-serif; color:#111; font-size:12px; }"
                    + "table { border-collapse: collapse; width:100%; }"
                    + "th, td { border: 1px solid #444; padding: 4px 6px; text-align:center; }"
                    + "th { background:#e7f2ec; }"
                    + "</style></head><body>" + (html == null ? "" : html) + "</body></html>";
        }

        private boolean wasSavedToday(File f) {
            if (!f.exists()) return false;
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(f.lastModified());
            Calendar now = Calendar.getInstance();
            return cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
                    && cal.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR);
        }

        private String readAll(File f) {
            FileInputStream in = null;
            try {
                in = new FileInputStream(f);
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                return new String(buf.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            } finally {
                if (in != null) {
                    try { in.close(); } catch (Exception ignored) {}
                }
            }
        }

        private void writeAll(File f, String content) throws IOException {
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        }

        private String toJsonString(String v) {
            StringBuilder sb = new StringBuilder("\"");
            for (int i = 0; i < v.length(); i++) {
                char c = v.charAt(i);
                if (c == '"' || c == '\\') sb.append("\\").append(c);
                else sb.append(c);
            }
            return sb.append("\"").toString();
        }
    }
}
