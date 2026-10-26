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

class TranscriptRetryTests(unittest.TestCase):
 def test_audio_recheck_reuses_whisper_and_disables_previous_token_conditioning(self):
  import sys
  import types
  from unittest.mock import Mock, patch
  runtime=server.Runtime()
  runtime.loaded='whisper'
  runtime.model=Mock(return_value={'chunks':[{'text':'Hello','timestamp':(0.1,0.5)}]})
  fake_transformers=types.SimpleNamespace(pipeline=Mock())
  with patch.dict(sys.modules,{'torch':types.SimpleNamespace(),'transformers':fake_transformers}), patch.object(server,'local_file',return_value='synthetic.wav'), patch.object(server,'load_audio',return_value=b'audio'):
   first=runtime.transcribe({'file':'synthetic.wav'})
   retried=runtime.transcribe({'file':'synthetic.wav','retry':True})
  self.assertEqual(first,retried)
  self.assertEqual(first['words'][0]['word'],'Hello')
  fake_transformers.pipeline.assert_not_called()
  initial=runtime.model.call_args_list[0].kwargs['generate_kwargs']
  retry=runtime.model.call_args_list[1].kwargs['generate_kwargs']
  self.assertFalse(initial['condition_on_prev_tokens'])
  self.assertFalse(retry['condition_on_prev_tokens'])
  self.assertEqual(retry['compression_ratio_threshold'],1.35)

if __name__=='__main__':unittest.main()
