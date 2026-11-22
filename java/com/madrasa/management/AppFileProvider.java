package com.madrasa.management;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileInputStream;

public class AppFileProvider extends ContentProvider {
    private static final String[] COLUMNS = {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

    private File fileForUri(Uri uri) {
        File dir = new File(getContext().getFilesDir(), "shared");
        File f = new File(dir, uri.getLastPathSegment());
        try {
            if (!f.getCanonicalPath().startsWith(dir.getCanonicalPath())) return null;
        } catch (Exception e) { return null; }
        return f;
    }

    @Override
    public boolean onCreate() {
        File dir = new File(getFilesDir(), "shared");
        return dir.exists() || dir.mkdirs();
    }

    private File getFilesDir() {
        return new File(getContext().getFilesDir(), "shared");
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileForUri(uri);
        if (f == null || !f.exists()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        File f = fileForUri(uri);
        if (projection == null) projection = COLUMNS;
        MatrixCursor c = new MatrixCursor(projection);
        if (f != null && f.exists()) {
            Object[] row = new Object[projection.length];
            for (int i = 0; i < projection.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(projection[i])) row[i] = f.getName();
                else if (OpenableColumns.SIZE.equals(projection[i])) row[i] = f.length();
                else row[i] = null;
            }
            c.addRow(row);
        }
        return c;
    }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n != null && n.endsWith(".json")) return "application/json";
        if (n != null && n.endsWith(".csv")) return "text/csv";
        return "application/octet-stream";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override
    public int delete(Uri uri, String sel, String[] args) { return 0; }
    @Override
    public int update(Uri uri, ContentValues v, String sel, String[] args) { return 0; }
}
