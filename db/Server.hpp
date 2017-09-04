#ifndef Server_INCLUDE_ONCE
#define Server_INCLUDE_ONCE

#include <QObject>
#include "HashTableCompiled.hpp"

class QTcpServer;
class QTcpSocket;
class QNetworkSession;

struct Collision {
  int collisions;
  std::string word;
};

class Server : public QObject
{
    Q_OBJECT
public:
    Server(QObject* parent);

private slots:
    void sessionOpened();
    void connectSocket();
    void disconnectedSocket( QTcpSocket* socket );
    void enqueueCommands( QTcpSocket* socket );

public:
    bool initDB();
    const HashTableCompiled& db() const { return mDB; }

private:
    QTcpServer *mTcpServer;
    std::set<QTcpSocket*> mSockets;
    QNetworkSession *mNetworkSession;
    QString mCommandQueue;
    HashTableCompiled mDB;
};

#endif
