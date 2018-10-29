"""
tub.py

Manage tubs
"""

import os, sys, time
import json
import tornado.web
from stat import S_ISREG, ST_MTIME, ST_MODE, ST_CTIME, ST_ATIME
import boto3
import botocore


class TubManager:

    def run(self, args):
        WebServer(args).start()


class WebServer(tornado.web.Application):

    def __init__(self, args):
        data_path = ""
        bucket = ""
        prefix = ""
        print(args)
        data_path = args[0]
        if not os.path.exists(data_path):
            raise ValueError('The path {} does not exist.'.format(data_path))
        if len(args) == 3:
            bucket = args[1]
            prefix = args[2]

        print (data_path)

        this_dir = os.path.dirname(os.path.realpath(__file__))
        static_file_path = os.path.join(this_dir, 'tub_web', 'static')



        handlers = [
            (r"/", tornado.web.RedirectHandler, dict(url="/tubs")),
            (r"/tubs", TubsView, dict(data_path=data_path, bucket=bucket, prefix=prefix)),
            (r"/tubs/?(?P<tub_id>[^/]+)?", TubView),
            (r"/api/tubs/?(?P<tub_id>[^/]+)?", TubApi, dict(data_path=data_path , bucket=bucket, prefix=prefix)),
            (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": static_file_path}),
            (r"/tub_data/(.*)", tornado.web.StaticFileHandler, {"path": data_path}),
            ]

        settings = {'debug': True}

        super().__init__(handlers, **settings)

    def start(self, port=8886):
        self.port = int(port)
        self.listen(self.port)

        print('Listening on {}...'.format(port))
        tornado.ioloop.IOLoop.instance().start()


class TubsView(tornado.web.RequestHandler):

    def initialize(self, data_path, bucket, prefix):
        self.data_path = data_path
        self.bucket = bucket
        if len(prefix) >0:
            self.prefix = prefix[:-1]

    def get(self):

        print ("data_path:" + self.data_path)
        s3_dir_list = []
        dir_list = []
        if len(self.bucket) > 0 and len(self.prefix) > 0 :
            s3 = boto3.client('s3')
            result = s3.list_objects_v2(Bucket=self.bucket, Prefix=self.prefix, Delimiter="/")
            for o in result.get('CommonPrefixes'):
                print(o.get('Prefix')) 
                s3_dir_list.append(o.get('Prefix'))
        import fnmatch
        dir_list = fnmatch.filter(os.listdir(self.data_path), '*')
        
        dir_list.sort()
        print (dir_list)
        data = {"tubs": dir_list, "s3": self.bucket, "tubs-s3": s3_dir_list, "prefix": self.prefix}
        self.render("tub_web/tubs.html", **data)


class TubView(tornado.web.RequestHandler):

    def get(self, tub_id):
        data = {}
        self.render("tub_web/tub.html", **data)
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')

class TubApi(tornado.web.RequestHandler):

    def initialize(self, data_path, bucket, prefix):
        self.data_path = data_path
        self.bucket = ""
        self.prefix= ""
        self.region = "ap-northeast-2"
        self.is_s3 = False
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  

    def image_path(self, tub_path, frame_id):
        if self.is_s3:
            return "https://s3." + self.region + "amazonaws.com/" + self.bucket + "/" + self.prefix + "/" + str(frame_id) + "_cam-image_array_.jpg"
        else :
            return os.path.join(tub_path, str(frame_id) + "_cam-image_array_.jpg")

    def record_path(self, tub_path, frame_id):
        return os.path.join(tub_path, "record_" + frame_id + ".json")

    def get_s3_prefix(self, tub_path):
        if self.is_s3:
            return True
        
        print("tub_path=" + tub_path)
        args = tub_path.split(",")
        print(args)

        if len(args) == 4: # TODO add prefi check
            self.bucket = args[1]
            self.prefix = args[2] + "/" + args[3]
            self.is_s3 = True
            return True
        else:
            return False
       
    def get_matching_s3_objects(self, bucket, prefix='', suffix=''):
        s3 = boto3.client('s3')
        kwargs = {'Bucket': bucket}

        # If the prefix is a single string (not a tuple of strings), we can
        # do the filtering directly in the S3 API.
        if isinstance(prefix, str):
            kwargs['Prefix'] = prefix

        while True:

            # The S3 API response is a large blob of metadata.
            # 'Contents' contains information about the listed objects.
            resp = s3.list_objects_v2(**kwargs)

            try:
                contents = resp['Contents']
            except KeyError:
                return

            for obj in contents:
                key = obj['Key']
                if key.startswith(prefix) and key.endswith(suffix):
                    yield obj

            # The S3 API is paginated, returning up to 1000 keys at a time.
            # Pass the continuation token into the next response, until we
            # reach the final page (when this field is missing).
            try:
                kwargs['ContinuationToken'] = resp['NextContinuationToken']
            except KeyError:
                break


    def get_matching_s3_keys(self, bucket, prefix='', suffix=''):
        for obj in self.get_matching_s3_objects(bucket, prefix, suffix):
            yield obj['Key']
 
    def get_seqs(self, tub_path):
      
        seqs = []
            
        if self.get_s3_prefix(tub_path):    
            prefix = self.prefix + "/record"
            result = self.get_matching_s3_keys(self.bucket, prefix, ".json")
            for o in result:
                seq = o.split(".")[0].split("_")[-1] 
                print(seq)
                seqs.append(int(seq))
        else:
            seqs = [ int(f.split("_")[0]) for f in os.listdir(tub_path) if f.endswith('.jpg') ]

        seqs.sort()
        return seqs


    def get_entries(self, tub_path, seqs):
        if self.is_s3:
            #return ((self.image_path(tub_path, seq), seq) for seq in seqs)
            return ((seq, seq) for seq in seqs)
        else:
            return ((os.stat(self.image_path(tub_path, seq))[ST_ATIME], seq) for seq in seqs)

    def clips_of_tub(self, tub_path):
        seqs = self.get_seqs(tub_path)
        entries = self.get_entries(tub_path, seqs)
        print(len(seqs))
        (last_ts, seq) = next(entries)
        clips = [[seq]]
        for next_ts, next_seq in entries:
            if next_ts - last_ts > 5000:  #greater than 1s apart
                clips.append([next_seq])
            else:
                clips[-1].append(next_seq)
            last_ts = next_ts

        return clips

    def get(self, tub_id):
        clips = self.clips_of_tub(os.path.join(self.data_path, tub_id))

        self.set_header("Content-Type", "application/json; charset=UTF-8")
        self.write(json.dumps({'clips': clips}))

    def post(self, tub_id):
        tub_path = os.path.join(self.data_path, tub_id)
        old_clips = self.clips_of_tub(tub_path)
        new_clips = tornado.escape.json_decode(self.request.body)

        import itertools
        old_frames = list(itertools.chain(*old_clips))
        new_frames = list(itertools.chain(*new_clips['clips']))
        frames_to_delete = [str(item) for item in old_frames if item not in new_frames]
        for frm in frames_to_delete:
            os.remove(self.record_path(tub_path, frm))
            os.remove(self.image_path(tub_path, frm))
