import importlib.util
import pathlib
import unittest
spec=importlib.util.spec_from_file_location('model_server',pathlib.Path(__file__).parents[1]/'python'/'model_server.py')
server=importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
class ModelSafetyTests(unittest.TestCase):
 def test_text_messages_preserve_private_dialogue(self):
  messages=[{'role':'user','content':'Keep this exact dialogue.'}]
  self.assertEqual(server.messages_for_processor(messages),messages)
 def test_invalid_role_rejected(self):
  with self.assertRaises(ValueError):server.messages_for_processor([{'role':'tool','content':'ignored'}])
 def test_remote_images_rejected(self):
  with self.assertRaises(ValueError):server.decode_image('https://example.com/private.png')
 def test_nonlocal_file_rejected(self):
  with self.assertRaises(ValueError):server.local_file('../../etc/passwd')
 def test_request_limits(self):
  with self.assertRaises(ValueError):server.messages_for_processor([{}]*33)
if __name__=='__main__':unittest.main()
