#include <iostream>
#include <cstring>
#include <unistd.h>
#include <netinet/in.h>
#include <filesystem>
#include <sstream>
#include <fstream>
#include <thread>
#include <mutex>
#include <csignal>
#include <algorithm>
#include <sqlite3.h>

std::mutex mtx;

namespace fs = std::filesystem;
int sendall(int sockfd, const char *buf, std::streamsize *len)
{
  std::streamsize total = 0;
  std::streamsize bytesleft = *len;
  std::streamsize n = 0;
  while (total < *len)
  {
    n = send(sockfd, buf + total, bytesleft, 0);
    if (n == -1 || n == 0)
    {
      break;
    }
    total += n;
    bytesleft -= n;
  }
  *len = total;
  return (n == -1) ? -1 : 0;
};


const char *DB_FILE = "fileshare.db";
const long long MAX_FILE = 200LL * 1024 * 1024; 

sqlite3 *openDb()
{
  sqlite3 *db = nullptr;
  if (sqlite3_open(DB_FILE, &db) != SQLITE_OK)
  {
    std::cerr << "Cannot open database: " << sqlite3_errmsg(db) << "\n";
    sqlite3_close(db);
    return nullptr;
  }
  sqlite3_busy_timeout(db, 5000); 
  return db;
}

void handleclient(int client)
{
  sqlite3 *db = openDb();
  if (db == nullptr)
  {
    close(client);
    return;
  }
  bool connected = true;
  try{
      while (connected)
  {
    char reply[4096] = {0};
    char d;
    std::string message;

    while (true)
    {
      ssize_t r = read(client, &d, sizeof(d));
      if (r == 0 || r == -1)
      {
        connected = false;
        break;
      }
      if (d == '\n')
      {
        break;
      }
      message += d;
    }
    if (!connected)
    {
      break;
    }
    std::string operation;
    std::string FileName;
    std::stringstream ss(message);
    ss >> operation;
    getline(ss >> std::ws, FileName);
    {
      std::lock_guard<std::mutex> lock(mtx); 
      std::cout << "client says " << message << "\n";
    };

    bool needsName = operation == "DELETE" || operation == "DOWNLOAD" || operation == "UPLOAD";
    if (needsName && (FileName.empty() || FileName == "." || FileName == ".."
                      || FileName != fs::path(FileName).filename().string()))
    {
      std::string m = "Invalid file name\n";
      send(client, m.c_str(), m.length(), 0);
      if (operation == "UPLOAD") connected = false; 
      continue;
    }

    std::string filelist;
    if(operation == "SEARCH"){
      auto count =0;
      std::string m;
      sqlite3_stmt *st = nullptr;
      
      if(sqlite3_prepare_v2(db,"SELECT name FROM files WHERE instr(name, ?) > 0 ORDER BY name",-1,&st,nullptr)== SQLITE_OK){
         sqlite3_bind_text(st, 1, FileName.c_str(), -1, SQLITE_TRANSIENT);
           while (sqlite3_step(st) == SQLITE_ROW)
    {
      filelist += (const char *)sqlite3_column_text(st, 0);
      filelist += "\n";
    }
      }
      sqlite3_finalize(st);
      
        filelist += "\n";
        send(client , filelist.c_str(),filelist.length(),0);
      
       
    }

   else if (operation == "LIST")
    {
      auto count = 0;

      sqlite3_stmt *st = nullptr;
      if (sqlite3_prepare_v2(db, "SELECT name FROM files ORDER BY name", -1, &st, nullptr) == SQLITE_OK)
      {
        while (sqlite3_step(st) == SQLITE_ROW)
        {
          filelist += (const char *)sqlite3_column_text(st, 0);
          filelist += "\n";
        }
      }
      sqlite3_finalize(st);
      count = filelist.length();

      std::string co = std::to_string(count) + "\n";
      if(count == 0){
          std::cout<<"storage is empty\n";
      }
      

      send(client, co.c_str(), co.length(), 0);
      send(client, filelist.c_str(), filelist.length(), 0);
    }
    else if (operation == "DOWNLOAD")
    {

      sqlite3_stmt *st = nullptr;
      sqlite3_blob *blob = nullptr;
      sqlite3_int64 rowid = 0;
      bool found = false;
      if (sqlite3_prepare_v2(db, "SELECT rowid FROM files WHERE name = ?", -1, &st, nullptr) == SQLITE_OK)
      {
        sqlite3_bind_text(st, 1, FileName.c_str(), -1, SQLITE_TRANSIENT);
        if (sqlite3_step(st) == SQLITE_ROW)
        {
          rowid = sqlite3_column_int64(st, 0);
          found = true;
        }
      }
      sqlite3_finalize(st);

      if (!found || sqlite3_blob_open(db, "main", "files", "data", rowid, 0, &blob) != SQLITE_OK)
      {
        std::cerr << "Error in opening file\n";

        std::string error = "Error in opening file\n";
        send(client, error.c_str(), error.length(), 0);
      }
      else
      {
        std::string s = "\n";
        send(client, s.c_str(), s.length(), 0);
        char buffer[4096];
        int n = sqlite3_blob_bytes(blob);

        std::cout << "total bytes read" << n << "\n";

        std::string filesize = std::to_string(n) + "\n";
        send(client, filesize.c_str(), filesize.length(), 0);

        for (int offset = 0; offset < n;)
        {
          int chunk = std::min(n - offset, (int)sizeof(buffer));
          if (sqlite3_blob_read(blob, buffer, chunk, offset) != SQLITE_OK)
          {
            connected = false; 
            break;
          }
          std::streamsize bytesRead = chunk;
          if (sendall(client, buffer, &bytesRead) == -1 || bytesRead != chunk)
          {
            connected = false; 
            break;
          }
          offset += chunk;
        }
      }
      if (blob) sqlite3_blob_close(blob);
    }
    else if (operation == "UPLOAD")
    {
      char c;
      std::string filesize;
      std::string token;

      while(true){
        ssize_t t= read(client , &c,sizeof(c));
        if(t == 0 || t == -1){
          break;
        }
        if(c == '\n'){
          break;
        }
        token +=c;

      }
      while (true)
      {
        ssize_t t = read(client, &c, sizeof(c));
        if (t == 0 || t == -1)
        {
          break;
        }
        if (c == '\n')
        {
          break;
        }
        filesize += c;
      }
      long long FS = 0;
      try
      {
        FS = std::stoll(filesize);
        std::cout << "size of file:" << filesize << "\n";

        if (FS < 0 || FS > MAX_FILE)
        {
          std::string m = "File is too large or size is not valid\n";
          send(client, m.c_str(), m.length(), 0);
          connected = false;
        }
        else
        {
       
          std::string data;
          while ((long long)data.size() < FS)
          {
            long long want = std::min<long long>(sizeof(reply), FS - (long long)data.size());
            ssize_t bytesReceived = read(client, reply, want);
            if (bytesReceived <= 0)
            {
              break;
            }
            data.append(reply, bytesReceived);
          }

          
          bool ok = ((long long)data.size() == FS);
          std::string denied;
          if (ok)
          {
            sqlite3_stmt *q = nullptr;
            if (sqlite3_prepare_v2(db, "SELECT token FROM files WHERE name = ?", -1, &q, nullptr) == SQLITE_OK)
            {
              sqlite3_bind_text(q, 1, FileName.c_str(), -1, SQLITE_TRANSIENT);
              if (sqlite3_step(q) == SQLITE_ROW)
              {
                std::string owner = (const char *)sqlite3_column_text(q, 0);
                if (!owner.empty() && owner != token)
                {
                  ok = false;
                  denied = "Only the user who uploaded this file can replace it\n";
                }
              }
            }
            sqlite3_finalize(q);
          }
          if (ok)
          {
            sqlite3_stmt *st = nullptr;
            ok = sqlite3_prepare_v2(db, "INSERT OR REPLACE INTO files(name,token, size, data) VALUES(?,?, ?, ?)", -1, &st, nullptr) == SQLITE_OK;
            if (ok)
            {
              sqlite3_bind_text(st, 1, FileName.c_str(), -1, SQLITE_TRANSIENT);
              sqlite3_bind_text(st,2,token.c_str(),-1,SQLITE_TRANSIENT);
              sqlite3_bind_int64(st, 3, FS);
              sqlite3_bind_blob64(st, 4, data.data(), data.size(), SQLITE_STATIC);
              ok = sqlite3_step(st) == SQLITE_DONE;
            }
            sqlite3_finalize(st);
          }

          std::string message = ok ? "File is successfully uploaded\n"
                                   : (denied.empty() ? "Error in uploading file\n" : denied);
          send(client, message.c_str(), message.length(), 0);
          if ((long long)data.size() != FS)
          {
            connected = false; 
          }
        }
      }
      catch (std::exception &err)
      {
        std::cerr << "Error in uploading file ,filesize is not valid\n";
        std::string m = "Error in uploading file ,filesize is not valid\n";
        send(client , m.c_str(),m.length(),0);
        connected = false; 
      }

      
    }else if(operation == "CREATE" && FileName =="USER"){
     char n;
      std::string Name;
      while (true)
      {
        ssize_t t = read(client, &n, sizeof(n));
        if (t == 0 || t == -1)
        {
          break;
        }
        if (n == '\n')
        {
          break;
        }
        Name += n;
      }

      char e;
      std::string email;
      while (true)
      {
        ssize_t t = read(client, &e, sizeof(e));
        if (t == 0 || t == -1)
        {
          break;
        }
        if (e == '\n')
        {
          break;
        }
       email += e;
      }
       char p;
      std::string password;
      while (true)
      {
        ssize_t t = read(client, &p, sizeof(p));
        if (t == 0 || t == -1)
        {
          break;
        }
        if (p == '\n')
        {
          break;
        }
        password += p;
      }
       std::string m;
      sqlite3_stmt *st = nullptr;
      if(sqlite3_prepare_v2(db, "INSERT INTO users(name, email, password) VALUES(?, ?, ?)", -1, &st, nullptr) == SQLITE_OK){
         sqlite3_bind_text(st, 1, Name.c_str(), -1, SQLITE_TRANSIENT);
             sqlite3_bind_text(st, 2, email.c_str(), -1, SQLITE_TRANSIENT);
              sqlite3_bind_text(st, 3,password.c_str(), -1, SQLITE_TRANSIENT);
              int rc = sqlite3_step(st);
        if (rc == SQLITE_DONE) m = "User created successfully\n";
        else if (rc == SQLITE_CONSTRAINT) m = "Email already registered\n";
        else m = "Error in creating user\n";
      }
       else m = "Error in creating user\n";
      sqlite3_finalize(st);
      send(client, m.c_str(), m.length(), 0);



    } else if(operation == "LOGIN" && FileName =="USER"){
    
      char e;
      std::string email;
      while (true)
      {
        ssize_t t = read(client, &e, sizeof(e));
        if (t == 0 || t == -1)
        {
          break;
        }
        if (e == '\n')
        {
          break;
        }
       email += e;
      }

       char p;
      std::string password;
      while (true)
      {
        ssize_t t = read(client, &p, sizeof(p));
        if (t == 0 || t == -1)
        {
          break;
        }
        if (p == '\n')
        {
          break;
        }
        password += p;
      }
            
       std::string m = "NOUSER\n";
      sqlite3_stmt *st = nullptr;
      if(sqlite3_prepare_v2(db,"SELECT name FROM users WHERE email=? AND password =? ",-1, &st, nullptr)== SQLITE_OK){
        sqlite3_bind_text(st, 1, email.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(st, 2, password.c_str(), -1, SQLITE_TRANSIENT);
        if(sqlite3_step(st) == SQLITE_ROW){
          m="OK\n" 
          + std::string((const char*)sqlite3_column_text(st,0)) +"\n";

          
        }
      }
      sqlite3_finalize(st);
      send(client, m.c_str(), m.length(), 0);
      



    } else if(operation =="QUIT"){
       std::cout<<"Client disconnected\n";
      connected = false;
     
    }else if(operation == "DELETE"){
  std::string m;
  sqlite3_stmt *st = nullptr;
  int rc = SQLITE_ERROR;
   char c;
      
      std::string token;

      while(true){
        ssize_t t= read(client , &c,sizeof(c));
        if(t == 0 || t == -1){
          break;
        }
        if(c == '\n'){
          break;
        }
        token +=c;

      }

      std::string denied;
      {
        sqlite3_stmt *q = nullptr;
        if (sqlite3_prepare_v2(db, "SELECT token FROM files WHERE name = ?", -1, &q, nullptr) == SQLITE_OK)
        {
          sqlite3_bind_text(q, 1, FileName.c_str(), -1, SQLITE_TRANSIENT);
          if (sqlite3_step(q) == SQLITE_ROW)
          {
            std::string owner = (const char *)sqlite3_column_text(q, 0);
            if (!owner.empty() && owner != token)
              denied = "Only the user who uploaded this file can delete it\n";
          }
        }
        sqlite3_finalize(q);
      }

  if (denied.empty() && sqlite3_prepare_v2(db, "DELETE FROM files WHERE name = ?", -1, &st, nullptr) == SQLITE_OK)
  {
    sqlite3_bind_text(st, 1, FileName.c_str(), -1, SQLITE_TRANSIENT);
    rc = sqlite3_step(st);
  }
  sqlite3_finalize(st);

  if (!denied.empty()){
     m = denied;
  }
  else if (rc != SQLITE_DONE){
     m = "Error in deleting file\n";
  }
  else if (sqlite3_changes(db) == 0){ // no row had this name
     m = "This file is not available on server\n";
  }
  else{
     m = FileName + " deleted successfully\n";
  }

send(client, m.c_str(), m.length(), 0);
    }else{

      std::cout<<"Invalid command from client\n";
      std::string m = "Invalid command \n";
       send(client , m.c_str(),m.length(),0);
    }
  }
  }catch(const std::exception &e){
     std::cerr << "client error: " << e.what() << "\n";
  }

  sqlite3_close(db);
  close(client);
}
int main()
{
  signal(SIGPIPE, SIG_IGN);


  sqlite3 *db = openDb();
  if (db == nullptr) return 1;
  sqlite3_exec(db, "PRAGMA journal_mode=WAL;", nullptr, nullptr, nullptr); 
  char *err = nullptr;
  if (sqlite3_exec(db,
                   "CREATE TABLE IF NOT EXISTS files("
                   "name TEXT PRIMARY KEY, token TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL, "
                   "created TEXT DEFAULT CURRENT_TIMESTAMP)",
                   nullptr, nullptr, &err) != SQLITE_OK)
  {
    std::cerr << "Cannot create table: " << err << "\n";
    return 1;
  }

  // older databases have no token column yet (the error is ignored when it already exists)
  sqlite3_exec(db, "ALTER TABLE files ADD COLUMN token TEXT NOT NULL DEFAULT ''", nullptr, nullptr, nullptr);

  if (sqlite3_exec(db,
                   "CREATE TABLE IF NOT EXISTS users("
                   "name TEXT NOT NULL ,email TEXT PRIMARY KEY, password TEXT NOT NULL, "
                   "created TEXT DEFAULT CURRENT_TIMESTAMP)",
                   nullptr, nullptr, &err) != SQLITE_OK){
    std::cerr<<"Cannot create table:" << err << "\n";
    return 1;
                   }
   

  sqlite3_close(db);

  int server = socket(AF_INET, SOCK_STREAM, 0);

  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = INADDR_ANY;
  address.sin_port = htons(8080);
 

  int opt =1;
  setsockopt(server,SOL_SOCKET,SO_REUSEADDR,&opt,sizeof(opt));
  if (bind(server, (sockaddr *)&address, sizeof(address)) == -1) { perror("bind"); return 1; }
  if (listen(server, 5) == -1) { perror("listen"); return 1; }

  std::cout << "server is waiting ...\n";

  while (true)
  {

    int client = accept(server, nullptr, nullptr);

    if (client == -1)
    {
      std::cerr << "Error in accepting client\n";

      continue;
    }

    std::cout << " new client connected...\n";
    std::thread(handleclient, client).detach();
  }

  return 0;
}